/*
/setup command: starts the guided setup flow.
*/

import type { ChatInputCommandInteraction } from 'discord.js';
import { CommandAuthorization } from '../authorization.js';
import { SetupFlow } from '../flows/setup-flow.js';
import type { ICommandHandler, InteractionFlow } from './command-handler.js';

export class SetupCommand implements ICommandHandler {
  readonly name = 'setup';
  readonly requiresAdmin = true;

  constructor(
    private readonly authorization: CommandAuthorization,
    private readonly createFlow: (interaction: ChatInputCommandInteraction) => SetupFlow
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
