/*
Guided /setup flow.
Explain: Country and city come from Location select menus carrying canonical
codes/IDs. Location owns all location rules; this flow only validates the
interaction and the selected option, then maps the resolved location into
settings. No country text input or fuzzy matching.
*/

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction
} from 'discord.js';
import { ILocationService, ResolvedLocation, cityRequiredError } from '../../modules/location/index.js';
import {
  CalculationMethod,
  CreateGuildSettingsInput,
  ISettingsService,
  MentionType
} from '../../modules/settings/index.js';
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

type Step = 'country' | 'city' | 'details' | 'confirm';

export class SetupFlow implements InteractionFlow {
  readonly name = 'setup' as const;
  readonly expiresAt: number;

  private step: Step = 'country';
  private countryCode: string | null = null;
  private resolved: ResolvedLocation | null = null;
  private countryPage = 0;
  private cityPage = 0;
  private method: CalculationMethod = 'Egyptian';
  private mentionType: MentionType = 'everyone';
  private mentionRoleId: string | null = null;
  private channelId = '';
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
    if (customId === 'setup:details-open') {
      await (interaction as ButtonInteraction).showModal(this.detailsModal());
      return;
    }
    await interaction.deferUpdate();
    // A repeated submission of the same step is acknowledged but not applied twice.
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
      case 'setup:details':
        await this.handleDetails(interaction as ModalSubmitInteraction);
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
        await this.initial.editReply({ content: 'That interaction is no longer valid. Run `/setup` again.', components: [] });
    }
  }

  private async handleCountry(interaction: StringSelectMenuInteraction): Promise<void> {
    const code = interaction.values[0];
    const country = this.locations.getCountry(code);
    if (!country || !this.locations.listCountries().some((item) => item.code === code)) {
      await this.initial.editReply({ content: 'Unknown country selection. Choose an option from the menu.', components: [] });
      return;
    }

    this.countryCode = country.code;
    try {
      const resolved = await this.locations.resolve({ countryCode: country.code });
      this.resolved = resolved;
      this.method = resolved.calculationMethod;
      await this.showDetails();
    } catch (error) {
      if (error === cityRequiredError) {
        await this.showCityMenu();
        return;
      }
      this.logger?.error({ guildId: this.initial.guildId, err: error }, 'Location resolution failed during setup');
      await this.initial.editReply({ content: 'The selected country could not be resolved. Try again.', components: [] });
    }
  }

  private async handleCity(interaction: StringSelectMenuInteraction): Promise<void> {
    if (!this.countryCode) {
      await this.initial.editReply({ content: 'Select a country first.', components: [] });
      return;
    }

    const city = interaction.values[0];
    if (!this.locations.listCities(this.countryCode).some((item) => item.id === city || item.name === city)) {
      await this.initial.editReply({ content: 'Unknown city selection. Choose an option from the menu.', components: [] });
      return;
    }

    try {
      this.resolved = await this.locations.resolve({ countryCode: this.countryCode, city });
      this.method = this.resolved.calculationMethod;
      await this.showDetails();
    } catch (error) {
      this.logger?.error({ guildId: this.initial.guildId, err: error }, 'City resolution failed during setup');
      await this.initial.editReply({ content: 'The selected city could not be resolved. Try again.', components: [] });
    }
  }

  private async handleDetails(interaction: ModalSubmitInteraction): Promise<void> {
    const channelId = interaction.fields.getTextInputValue('channel').trim();
    const mentionType = interaction.fields.getTextInputValue('mention').trim().toLowerCase();
    const roleId = interaction.fields.getTextInputValue('role').trim() || null;
    const leadTime = Number(interaction.fields.getTextInputValue('leadTime'));
    const method = interaction.fields.getTextInputValue('method').trim() as CalculationMethod;

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

    if (mentionType !== 'everyone' && mentionType !== 'role') {
      await this.initial.editReply({ content: 'Mention type must be "everyone" or "role".', components: [] });
      return;
    }
    if (mentionType === 'role' && !roleId) {
      await this.initial.editReply({ content: 'A role ID is required when mention type is "role".', components: [] });
      return;
    }
    if (!Number.isInteger(leadTime) || leadTime < 1 || leadTime > 60) {
      await this.initial.editReply({ content: 'Lead time must be a whole number between 1 and 60 minutes.', components: [] });
      return;
    }

    this.channelId = channelId;
    this.mentionType = mentionType;
    this.mentionRoleId = mentionType === 'role' ? roleId : null;
    this.leadTime = leadTime;
    this.method = method;
    await this.showConfirm();
  }

  private async confirm(): Promise<void> {
    if (!this.resolved || !this.initial.guildId) {
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
      calculationMethod: this.method,
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

  private async showCountryMenu(): Promise<void> {
    this.step = 'country';
    const { items, page, pages } = paginate(this.locations.listCountries(), this.countryPage);
    const menu = new StringSelectMenuBuilder()
      .setCustomId('setup:country')
      .setPlaceholder('Choose a country');
    for (const country of items) {
      menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(country.name).setValue(country.code));
    }
    await this.initial.editReply({
      content: 'Step 1: choose a country.',
      components: this.rows([new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)], 'country', page, pages)
    });
  }

  private async showCityMenu(): Promise<void> {
    this.step = 'city';
    const cities = this.countryCode ? this.locations.listCities(this.countryCode) : [];
    const { items, page, pages } = paginate(cities, this.cityPage);
    const menu = new StringSelectMenuBuilder().setCustomId('setup:city').setPlaceholder('Choose a city');
    for (const city of items) {
      menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(city.name).setValue(city.id));
    }
    await this.initial.editReply({
      content: 'Step 2: a city is required. Choose one.',
      components: this.rows([new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)], 'city', page, pages)
    });
  }

  private async showDetails(): Promise<void> {
    this.step = 'details';
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('setup:details-open').setLabel('Enter details').setStyle(ButtonStyle.Primary)
    );
    await this.initial.editReply({ content: 'Step 3: fill in the remaining details.', components: [row] });
  }

  private detailsModal(): ModalBuilder {
    const modal = new ModalBuilder().setCustomId('setup:details').setTitle('Prayer reminder details');
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('channel').setLabel('Text channel ID').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('mention').setLabel('Mention: everyone or role').setStyle(TextInputStyle.Short).setValue('everyone').setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('role').setLabel('Role ID (only for role)').setStyle(TextInputStyle.Short).setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('leadTime').setLabel('Voice lead time (1-60)').setStyle(TextInputStyle.Short).setValue('10').setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('method').setLabel('Calculation method').setStyle(TextInputStyle.Short).setValue(this.method).setRequired(true)
      )
    );
    return modal;
  }

  private async showConfirm(): Promise<void> {
    this.step = 'confirm';
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('setup:confirm').setLabel('Confirm').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('setup:private').setLabel(`Private voice: ${this.includePrivateVoice ? 'yes' : 'no'}`).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('setup:cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger)
    );
    await this.initial.editReply({
      content: `Review: ${this.resolved?.cityName ?? '?'}, ${this.resolved?.countryName ?? '?'} — ${this.resolved?.timezone ?? '?'}; channel ${this.channelId}; ${this.mentionType}; lead ${this.leadTime} min; method ${this.method}. Announcements stay disabled until /enable.`,
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
    if (pages > 1) {
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
      rows.push(nav);
    }
    return rows;
  }
}
