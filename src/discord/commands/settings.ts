/*
/settings command: starts the settings viewer/editor flow.
*/

import type { ChatInputCommandInteraction } from 'discord.js';
import { CommandAuthorization } from '../authorization.js';
import { SettingsFlow } from '../flows/settings-flow.js';
import type { ICommandHandler, InteractionFlow } from './command-handler.js';

export class SettingsCommand implements ICommandHandler {
  readonly name = 'settings';
  readonly requiresAdmin = true;

  constructor(
    private readonly authorization: CommandAuthorization,
    private readonly createFlow: (interaction: ChatInputCommandInteraction) => SettingsFlow
  ) {}

  async execute(interaction: ChatInputCommandInteraction): Promise<InteractionFlow | void> {
    if (!this.authorization.canConfigure(interaction)) {
      await interaction.reply({ content: 'You are not authorized to configure this server.', ephemeral: true });
      return;
    }

    const flow = this.createFlow(interaction);
    await flow.start();
    return flow;
  }
}
