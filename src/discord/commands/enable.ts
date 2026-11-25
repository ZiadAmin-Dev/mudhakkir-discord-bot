/*
/enable command: activates automated announcements after a valid configuration.
*/

import type { ChatInputCommandInteraction } from 'discord.js';
import { CommandAuthorization } from '../authorization.js';
import { ISettingsService } from '../../modules/settings/index.js';
import type { ICommandHandler } from './command-handler.js';

export class EnableCommand implements ICommandHandler {
  readonly name = 'enable';
  readonly requiresAdmin = true;

  constructor(
    private readonly authorization: CommandAuthorization,
    private readonly settings: ISettingsService
  ) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.authorization.canConfigure(interaction)) {
      await interaction.reply({ content: 'You are not authorized to configure this server.', ephemeral: true });
      return;
    }

    const guildId = interaction.guildId;
    if (!guildId || !this.settings.getSettings(guildId)) {
      await interaction.reply({ content: 'No configuration exists. Run `/setup` first.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    this.settings.setEnabled(guildId, true);
    await interaction.editReply({ content: 'Automated reminders enabled. Upcoming events were rescheduled.' });
  }
}
