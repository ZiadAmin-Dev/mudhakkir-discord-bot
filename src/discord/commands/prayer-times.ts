/*
/prayer-times command: read-only view of today's prayer times.
*/

import type { ChatInputCommandInteraction } from 'discord.js';
import { IPrayerTimesService } from '../../modules/prayer-times/index.js';
import { localDateInZone } from '../../modules/scheduling/index.js';
import { ISettingsService } from '../../modules/settings/index.js';
import { Clock } from '../../shared/clock.js';
import type { Logger } from '../../shared/logging/logger.port.js';
import type { ICommandHandler } from './command-handler.js';

export class PrayerTimesCommand implements ICommandHandler {
  readonly name = 'prayer-times';
  readonly requiresAdmin = false;

  constructor(
    private readonly settings: ISettingsService,
    private readonly prayerTimes: IPrayerTimesService,
    private readonly clock: Clock,
    private readonly logger?: Logger
  ) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }

    const current = this.settings.getSettings(interaction.guildId);
    if (!current) {
      await interaction.reply({ content: 'No configuration exists. Run `/setup` first.', ephemeral: true });
      return;
    }

    await interaction.deferReply();
    try {
      const date = localDateInZone(this.clock.now(), current.timezone);
      const result = this.prayerTimes.calculate({
        date,
        latitude: current.latitude,
        longitude: current.longitude,
        timezone: current.timezone,
        calculationMethod: current.calculationMethod
      });
      const lines = result.prayers.map((prayer) => `${prayer.prayer.padEnd(8)} ${prayer.localTime}`);
      await interaction.editReply({
        content: `Prayer times for ${current.cityName}, ${current.countryName} (${current.timezone}, ${date}):\n\`\`\`\n${lines.join('\n')}\n\`\`\``
      });
    } catch (error) {
      this.logger?.error({ guildId: interaction.guildId, err: error }, 'Prayer times command failed');
      await interaction.editReply({ content: 'Prayer times are temporarily unavailable. Please try again later.' });
    }
  }
}
