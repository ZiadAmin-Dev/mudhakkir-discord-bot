/*
Guided /setup flow.
Explain: Country and city come from Location select menus carrying canonical
codes/IDs. Location owns all location rules. The text channel and mention role
come from Discord's native pickers, so users never copy IDs. The calculation
method is always the one resolved by Location; it is not user-selectable.
*/

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChannelSelectMenuInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type RoleSelectMenuInteraction,
  type StringSelectMenuInteraction
} from 'discord.js';
import { Country, ILocationService, ResolvedLocation } from '../../modules/location/index.js';
import { CreateGuildSettingsInput, ISettingsService, MentionType } from '../../modules/settings/index.js';
import type { Logger } from '../../shared/logging/logger.port.js';
import type { ComponentInteraction, InteractionFlow } from '../commands/command-handler.js';

export const FLOW_EXPIRY_MS = 5 * 60_000;
export const SELECT_OPTION_LIMIT = 25;

export function paginate<T>(items: readonly T[], page: number): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / SELECT_OPTION_LIMIT));
  const current = Math.min(Math.max(page, 0), pages - 1);
  return {
    items: items.slice(current * SELECT_OPTION_LIMIT, (current + 1) * SELECT_OPTION_LIMIT),
    page: current,
    pages
  };
}

export class SetupFlow implements InteractionFlow {
  readonly name = 'setup' as const;
  readonly expiresAt: number;

  private country: Country | null = null;
  private resolved: ResolvedLocation | null = null;
  private countryPage = 0;
  private cityPage = 0;
  private channelId = '';
  private mentionType: MentionType = 'everyone';
  private mentionRoleId: string | null = null;
  private leadTime = 10;
  private includePrivateVoice = false;
  private lastCustomId: string | null = null;
  private finished = false;

  constructor(
    private readonly initial: ChatInputCommandInteraction,
    private readonly locations: ILocationService,
    private readonly settings: ISettingsService,
    private readonly logger?: Logger
  ) {
    this.expiresAt = Date.now() + FLOW_EXPIRY_MS;
  }

  async start(): Promise<void> {
    await this.initial.deferReply({ ephemeral: true });
    await this.showCountryMenu();
  }

  async handle(interaction: ComponentInteraction): Promise<void> {
    if (this.finished) {
      return;
    }

    const customId = interaction.customId;
    // Discord requires showModal to be the first response to an interaction.
    if (customId === 'setup:leadTime-open') {
      await (interaction as ButtonInteraction).showModal(this.leadTimeModal());
      return;
    }
    await interaction.deferUpdate();
    if (customId === this.lastCustomId) {
      return;
    }
    this.lastCustomId = customId;

    const parts = customId.split(':');
    if (parts[1] === 'page') {
      if (parts[2] === 'country') {
        this.countryPage = Number(parts[3]);
        await this.showCountryMenu();
      } else if (parts[2] === 'city') {
        this.cityPage = Number(parts[3]);
        await this.showCityMenu();
      }
      return;
    }

    switch (customId) {
      case 'setup:country':
        await this.handleCountry(interaction as StringSelectMenuInteraction);
        return;
      case 'setup:city':
        await this.handleCity(interaction as StringSelectMenuInteraction);
        return;
      case 'setup:city-default':
        await this.handleDefaultCity();
        return;
      case 'setup:channel':
        await this.handleChannel(interaction as ChannelSelectMenuInteraction);
        return;
      case 'setup:mention':
        await this.handleMentionChoice(interaction as StringSelectMenuInteraction);
        return;
      case 'setup:role':
        await this.handleRole(interaction as RoleSelectMenuInteraction);
        return;
      case 'setup:leadTime':
        await this.handleLeadTime(interaction as ModalSubmitInteraction);
        return;
      case 'setup:private':
        this.includePrivateVoice = !this.includePrivateVoice;
        await this.showConfirm();
        return;
      case 'setup:confirm':
        await this.confirm();
        return;
      case 'setup:cancel':
        this.finished = true;
        await this.initial.editReply({ content: 'Setup cancelled. No changes were saved.', components: [] });
        return;
      default:
        await this.initial.editReply({
          content: 'That interaction is no longer valid. Run `/setup` again.',
          components: []
        });
    }
  }

  private async handleCountry(interaction: StringSelectMenuInteraction): Promise<void> {
    const code = interaction.values[0];
    const country = this.locations.getCountry(code);
    if (!country || !this.locations.listCountries().some((item) => item.code === code)) {
      await this.invalidSelection('country');
      return;
    }

    this.country = country;
    this.cityPage = 0;
    await this.showCityMenu();
  }

  private async handleCity(interaction: StringSelectMenuInteraction): Promise<void> {
    if (!this.country) {
      await this.initial.editReply({ content: 'Select a country first.', components: [] });
      return;
    }

    const city = interaction.values[0];
    if (!this.locations.listCities(this.country.code).some((item) => item.id === city || item.name === city)) {
      await this.invalidSelection('city');
      return;
    }

    await this.resolveLocation({ countryCode: this.country.code, city });
  }

  private async handleDefaultCity(): Promise<void> {
    if (!this.country) {
      await this.initial.editReply({ content: 'Select a country first.', components: [] });
      return;
    }
    await this.resolveLocation({ countryCode: this.country.code });
  }

  private async resolveLocation(input: { countryCode: string; city?: string }): Promise<void> {
    try {
      this.resolved = await this.locations.resolve(input);
      await this.showChannelMenu();
    } catch (error) {
      this.logger?.error({ guildId: this.initial.guildId, err: error }, 'Location resolution failed during setup');
      await this.initial.editReply({
        content: 'That location could not be resolved. Choose another option.',
        components: []
      });
    }
  }

  private async handleChannel(interaction: ChannelSelectMenuInteraction): Promise<void> {
    const channelId = interaction.values[0];
    if (this.initial.guild) {
      try {
        const channel = await this.initial.guild.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
          await this.initial.editReply({ content: 'That text channel is not available in this server.', components: [] });
          return;
        }
      } catch {
        await this.initial.editReply({ content: 'That text channel is not available in this server.', components: [] });
        return;
      }
    }
    this.channelId = channelId;
    await this.showMentionMenu();
  }

  private async handleMentionChoice(interaction: StringSelectMenuInteraction): Promise<void> {
    const choice = interaction.values[0];
    if (choice === 'role') {
      await this.showRoleMenu();
      return;
    }
    // 'everyone' and 'skip' both mean the default @everyone target.
    this.mentionType = 'everyone';
    this.mentionRoleId = null;
    await this.showLeadTimeStep();
  }

  private async handleRole(interaction: RoleSelectMenuInteraction): Promise<void> {
    this.mentionType = 'role';
    this.mentionRoleId = interaction.values[0] ?? null;
    await this.showLeadTimeStep();
  }

  private async handleLeadTime(interaction: ModalSubmitInteraction): Promise<void> {
    const minutes = Number(interaction.fields.getTextInputValue('minutes'));
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
      await this.initial.editReply({ content: 'Lead time must be a whole number between 1 and 60.', components: [] });
      return;
    }
    this.leadTime = minutes;
    await this.showConfirm();
  }

  private async confirm(): Promise<void> {
    if (!this.resolved || !this.initial.guildId || !this.channelId) {
      await this.initial.editReply({ content: 'Setup is incomplete. Run `/setup` again.', components: [] });
      return;
    }

    const input: CreateGuildSettingsInput = {
      guildId: this.initial.guildId,
      enabled: false,
      countryName: this.resolved.countryName,
      cityName: this.resolved.cityName,
      latitude: this.resolved.latitude,
      longitude: this.resolved.longitude,
      timezone: this.resolved.timezone,
      calculationMethod: this.resolved.calculationMethod,
      textChannelId: this.channelId,
      mentionType: this.mentionType,
      mentionRoleId: this.mentionRoleId,
      voiceLeadTimeMinutes: this.leadTime,
      includePrivateVoice: this.includePrivateVoice
    };

    try {
      this.settings.saveSettings(input);
      this.finished = true;
      await this.initial.editReply({
        content: `Configuration saved for ${this.resolved.cityName}, ${this.resolved.countryName}. Run \`/enable\` to start reminders.`,
        components: []
      });
    } catch (error) {
      this.logger?.error({ guildId: this.initial.guildId, err: error }, 'Setup save failed');
      await this.initial.editReply({ content: 'Configuration could not be saved. No changes were applied.', components: [] });
    }
  }

  private async invalidSelection(kind: 'country' | 'city'): Promise<void> {
    await this.initial.editReply({
      content: `Unknown ${kind} selection. Choose an option from the menu.`,
      components: []
    });
  }

  private async showCountryMenu(): Promise<void> {
    const { items, page, pages } = paginate(this.locations.listCountries(), this.countryPage);
    const menu = new StringSelectMenuBuilder().setCustomId('setup:country').setPlaceholder('Choose a country');
    for (const country of items) {
      menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(country.name).setValue(country.code));
    }
    await this.initial.editReply({
      content: 'Step 1: choose a country.',
      components: this.rows([new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)], 'country', page, pages)
    });
  }

  private async showCityMenu(): Promise<void> {
    const cities = this.country ? this.locations.listCities(this.country.code) : [];
    const { items, page, pages } = paginate(cities, this.cityPage);
    const menu = new StringSelectMenuBuilder().setCustomId('setup:city').setPlaceholder('Choose a city');
    for (const city of items) {
      menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(city.name).setValue(city.id));
    }

    const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)
    ];
    // Countries with a default city make city selection optional.
    if (this.country && !this.country.cityRequired) {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('setup:city-default').setLabel('Use default city').setStyle(ButtonStyle.Secondary)
        )
      );
    }
    const nav = this.pageButtons('city', page, pages);
    if (nav) {
      rows.push(nav);
    }

    await this.initial.editReply({
      content: this.country?.cityRequired
        ? `Step 2: ${this.country.name} needs a city. Choose one.`
        : `Step 2: choose a city in ${this.country?.name ?? 'this country'}, or use its default city.`,
      components: rows
    });
  }

  private async showChannelMenu(): Promise<void> {
    const menu = new ChannelSelectMenuBuilder()
      .setCustomId('setup:channel')
      .setPlaceholder('Choose the channel for prayer reminders')
      .setChannelTypes(ChannelType.GuildText);
    await this.initial.editReply({
      content: 'Step 3: choose the text channel that will receive prayer reminders.',
      components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menu)]
    });
  }

  private async showMentionMenu(): Promise<void> {
    const menu = new StringSelectMenuBuilder().setCustomId('setup:mention').setPlaceholder('Choose a mention target');
    menu.addOptions(
      new StringSelectMenuOptionBuilder().setLabel('@everyone').setValue('everyone'),
      new StringSelectMenuOptionBuilder().setLabel('A role').setValue('role'),
      new StringSelectMenuOptionBuilder().setLabel('Skip (use @everyone)').setValue('skip')
    );
    await this.initial.editReply({
      content: 'Step 4: choose a mention target, or skip to use @everyone.',
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)]
    });
  }

  private async showRoleMenu(): Promise<void> {
    const menu = new RoleSelectMenuBuilder().setCustomId('setup:role').setPlaceholder('Choose the role to mention');
    await this.initial.editReply({
      content: 'Step 4: choose the role that should be mentioned.',
      components: [new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(menu)]
    });
  }

  private async showLeadTimeStep(): Promise<void> {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('setup:leadTime-open').setLabel('Set lead time').setStyle(ButtonStyle.Primary)
    );
    await this.initial.editReply({ content: 'Step 5: set the voice reminder lead time.', components: [row] });
  }

  private leadTimeModal(): ModalBuilder {
    const modal = new ModalBuilder().setCustomId('setup:leadTime').setTitle('Voice lead time');
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('minutes')
          .setLabel('Minutes (1-60)')
          .setStyle(TextInputStyle.Short)
          .setValue('10')
          .setRequired(true)
      )
    );
    return modal;
  }

  private async showConfirm(): Promise<void> {
    const mention = this.mentionType === 'role' ? `<@&${this.mentionRoleId}>` : '@everyone';
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('setup:confirm').setLabel('Confirm').setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('setup:private')
        .setLabel(`Private voice: ${this.includePrivateVoice ? 'yes' : 'no'}`)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('setup:cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger)
    );
    await this.initial.editReply({
      content:
        `Review: ${this.resolved?.cityName ?? '?'}, ${this.resolved?.countryName ?? '?'} — ` +
        `${this.resolved?.timezone ?? '?'}; channel <#${this.channelId}>; ${mention}; ` +
        `lead ${this.leadTime} min; method ${this.resolved?.calculationMethod ?? '?'}. ` +
        'Announcements stay disabled until /enable.',
      components: [row]
    });
  }

  private rows(
    main: ActionRowBuilder<StringSelectMenuBuilder>[],
    kind: 'country' | 'city',
    page: number,
    pages: number
  ): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [...main];
    const nav = this.pageButtons(kind, page, pages);
    if (nav) {
      rows.push(nav);
    }
    return rows;
  }

  private pageButtons(kind: 'country' | 'city', page: number, pages: number): ActionRowBuilder<ButtonBuilder> | null {
    if (pages <= 1) {
      return null;
    }
    const nav = new ActionRowBuilder<ButtonBuilder>();
    if (page > 0) {
      nav.addComponents(
        new ButtonBuilder().setCustomId(`setup:page:${kind}:${page - 1}`).setLabel('Previous').setStyle(ButtonStyle.Secondary)
      );
    }
    if (page < pages - 1) {
      nav.addComponents(
        new ButtonBuilder().setCustomId(`setup:page:${kind}:${page + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary)
      );
    }
    return nav;
  }
}
