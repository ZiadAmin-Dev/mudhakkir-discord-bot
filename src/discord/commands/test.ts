/*
/test command: exercises text and voice delivery directly.
Explain: It never goes through the scheduler or delivery ledger, so a test
cannot consume, suppress, or modify a real prayer event (BR-051).
*/

import type { ChatInputCommandInteraction } from 'discord.js';
import { PrayerName } from '../../modules/prayer-times/index.js';
import { ISettingsService } from '../../modules/settings/index.js';
import { ITextAnnouncementService, IVoiceAnnouncementService } from '../../modules/reminders/index.js';
import { CommandAuthorization } from '../authorization.js';
import type { ICommandHandler } from './command-handler.js';

const PRAYERS: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export class TestCommand implements ICommandHandler {
  readonly name = 'test';
  readonly requiresAdmin = true;

  constructor(
    private readonly authorization: CommandAuthorization,
    private readonly settings: ISettingsService,
    private readonly text: ITextAnnouncementService,
    private readonly voice: IVoiceAnnouncementService
  ) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.authorization.canConfigure(interaction)) {
      await interaction.reply({ content: 'You are not authorized to test this server.', ephemeral: true });
      return;
    }

    const guildId = interaction.guildId;
    const current = guildId ? this.settings.getSettings(guildId) : null;
    if (!current || !guildId) {
      await interaction.reply({ content: 'No configuration exists. Run `/setup` first.', ephemeral: true });
      return;
    }

    const type = interaction.options.getString('type') ?? 'text';
    const prayer = interaction.options.getString('prayer') ?? 'fajr';
    if (!PRAYERS.includes(prayer as PrayerName) || !['text', 'voice', 'both'].includes(type)) {
      await interaction.reply({ content: 'Invalid test type or prayer.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    if (type === 'text' || type === 'both') {
      await this.text.send(prayer as PrayerName, current, true);
    }
    if (type === 'voice' || type === 'both') {
      await this.voice.runCycle(prayer as PrayerName, current, true);
    }

    await interaction.editReply({
      content: `Test completed for ${prayer} (${type}). Output is labelled [TEST] and mentions are suppressed; real scheduled events and the delivery ledger were not modified.`
    });
  }
}
