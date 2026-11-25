/*
Guided /settings flow.
Explain: Shows the current configuration and supports editing individual values
through SettingsService. Business validation stays in Settings; Discord only
parses the interaction and presents results.
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
import { ISettingsService } from '../../modules/settings/index.js';
import type { Logger } from '../../shared/logging/logger.port.js';
import type { ComponentInteraction, InteractionFlow } from '../commands/command-handler.js';
import { FLOW_EXPIRY_MS } from './setup-flow.js';

export class SettingsFlow implements InteractionFlow {
  readonly name = 'settings' as const;
  readonly expiresAt: number;

  private lastCustomId: string | null = null;
  private finished = false;

  constructor(
    private readonly initial: ChatInputCommandInteraction,
    private readonly settings: ISettingsService,
    private readonly logger?: Logger
  ) {
    this.expiresAt = Date.now() + FLOW_EXPIRY_MS;
  }

  async start(): Promise<void> {
    await this.initial.deferReply({ ephemeral: true });
    await this.showSummary();
  }

  async handle(interaction: ComponentInteraction): Promise<void> {
    if (this.finished) {
      return;
    }
    const customId = interaction.customId;
    if (customId === 'settings:leadTime-open') {
      await (interaction as ButtonInteraction).showModal(this.leadTimeModal());
      return;
    }
    await interaction.deferUpdate();
    if (customId === this.lastCustomId) {
      return;
    }
    this.lastCustomId = customId;

    if (customId === 'settings:section') {
      const section = (interaction as StringSelectMenuInteraction).values[0];
      if (section === 'leadTime') {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('settings:leadTime-open').setLabel('Edit lead time').setStyle(ButtonStyle.Primary)
        );
        await this.initial.editReply({ content: 'Choose edit lead time to continue.', components: [row] });
      } else {
        await this.initial.editReply({
          content: 'That section is view-only in this release. Use /setup to reconfigure it.',
          components: []
        });
        this.finished = true;
      }
      return;
    }

    if (customId === 'settings:leadTime') {
      await this.updateLeadTime(interaction as ModalSubmitInteraction);
      return;
    }

    if (customId === 'settings:cancel') {
      this.finished = true;
      await this.initial.editReply({ content: 'Settings closed. No changes were saved.', components: [] });
      return;
    }

    await this.initial.editReply({ content: 'That interaction is no longer valid. Run /settings again.', components: [] });
  }

  private async showSummary(): Promise<void> {
    const current = this.settings.getSettings(this.initial.guildId ?? '');
    if (!current) {
      this.finished = true;
      await this.initial.editReply({ content: 'No configuration exists. Run `/setup` first.', components: [] });
      return;
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId('settings:section')
      .setPlaceholder('Choose a section');
    for (const [value, label] of [
      ['leadTime', `Lead time (${current.voiceLeadTimeMinutes} min)`],
      ['location', `Location (${current.cityName}, ${current.countryName})`],
      ['mention', `Mention (${current.mentionType})`]
    ]) {
      menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(label).setValue(value));
    }
    const cancel = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('settings:cancel').setLabel('Close').setStyle(ButtonStyle.Secondary)
    );
    await this.initial.editReply({
      content: `Settings for ${current.cityName}, ${current.countryName} — ${current.timezone}; enabled: ${current.enabled}.`,
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu), cancel]
    });
  }

  private leadTimeModal(): ModalBuilder {
    const modal = new ModalBuilder().setCustomId('settings:leadTime').setTitle('Voice lead time');
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('minutes')
          .setLabel('Minutes (1-60)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
    return modal;
  }

  private async updateLeadTime(interaction: ModalSubmitInteraction): Promise<void> {
    const minutes = Number(interaction.fields.getTextInputValue('minutes'));
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
      await this.initial.editReply({ content: 'Lead time must be a whole number between 1 and 60.', components: [] });
      return;
    }

    try {
      this.settings.updateSettings(this.initial.guildId ?? '', { voiceLeadTimeMinutes: minutes });
      this.finished = true;
      await this.initial.editReply({ content: `Lead time updated to ${minutes} minutes. Future reminders were rescheduled.`, components: [] });
    } catch (error) {
      this.logger?.error({ guildId: this.initial.guildId, err: error }, 'Settings update failed');
      await this.initial.editReply({ content: 'The change could not be saved. No changes were applied.', components: [] });
    }
  }
}
