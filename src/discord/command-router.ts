/*
Discord interaction router.
Explain: Dispatches slash commands and routes component interactions to the
active flow for the invoking user and guild. The router owns the in-memory flow
registry; flows own their step state.
*/

import { inject, injectable } from 'tsyringe';
import { TOKENS } from '../shared/di/tokens.js';
import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  Events,
  Interaction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction
} from 'discord.js';
import { CommandAuthorization } from './authorization.js';
import type { ComponentInteraction, ICommandHandler, InteractionFlow } from './commands/command-handler.js';
import type { Logger } from '../shared/logging/logger.port.js';

type RespondableInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;

interface ActiveFlow {
  flow: InteractionFlow;
  guildId: string;
  userId: string;
  expiresAt: number;
}

@injectable()
export class CommandRouter {
  private readonly handlers = new Map<string, ICommandHandler>();
  private readonly flows = new Map<string, ActiveFlow>();

  constructor(
    @inject(TOKENS.CommandHandlers) handlers: readonly ICommandHandler[],
    @inject(TOKENS.Authorization) private readonly authorization: CommandAuthorization,
    @inject(TOKENS.Logger) private readonly logger?: Logger
  ) {
    for (const handler of handlers) {
      this.handlers.set(handler.name, handler);
    }
  }

  async handle(interaction: Interaction): Promise<void> {
    if (!this.isRespondable(interaction)) {
      return;
    }

    try {
      if (interaction.isChatInputCommand()) {
        await this.handleCommand(interaction);
        return;
      }
      await this.handleComponent(interaction);
    } catch (error) {
      this.logger?.error(
        {
          guildId: interaction.guildId ?? undefined,
          userId: interaction.user.id,
          commandName: interaction.isChatInputCommand() ? interaction.commandName : undefined,
          interactionId: interaction.id,
          err: error
        },
        'Discord interaction failed'
      );
      const message = 'Something went wrong. Please try again.';
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ content: message });
        } else {
          await interaction.reply({ content: message, ephemeral: true });
        }
      } catch (replyError) {
        this.logger?.error({ err: replyError }, 'Failed to report interaction error');
      }
    }
  }

  private isRespondable(interaction: Interaction): interaction is RespondableInteraction {
    return (
      interaction.isChatInputCommand() ||
      interaction.isButton() ||
      interaction.isStringSelectMenu() ||
      interaction.isModalSubmit()
    );
  }

  private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const handler = this.handlers.get(interaction.commandName);
    if (!handler) {
      await interaction.reply({ content: 'Unknown command.', ephemeral: true });
      return;
    }
    if (handler.requiresAdmin && !this.authorization.canConfigure(interaction)) {
      await interaction.reply({ content: 'You are not authorized to use this command.', ephemeral: true });
      return;
    }

    const result = await handler.execute(interaction);
    if (result && interaction.guildId) {
      this.registerFlow(interaction.guildId, interaction.user.id, result);
    }
  }

  private async handleComponent(interaction: ComponentInteraction): Promise<void> {
    const key = this.flowKey(interaction.guildId, interaction.user.id);
    const active = key ? this.flows.get(key) : undefined;

    if (!active || !interaction.guildId || interaction.user.id !== active.userId) {
      await interaction.reply({ content: 'That interaction has expired. Run the command again.', ephemeral: true });
      return;
    }
    if (!this.authorization.canConfigure(interaction)) {
      await interaction.reply({ content: 'You are not authorized to continue this flow.', ephemeral: true });
      return;
    }
    if (this.now() > active.expiresAt) {
      this.flows.delete(key!);
      await interaction.reply({ content: 'That interaction has expired. Run the command again.', ephemeral: true });
      return;
    }

    await active.flow.handle(interaction);
  }

  private registerFlow(guildId: string, userId: string, flow: InteractionFlow): void {
    const key = `${guildId}:${userId}`;
    const existing = this.flows.get(key);
    if (existing) {
      this.logger?.debug({ guildId, userId, flow: existing.flow.name }, 'Replacing an active flow');
    }
    this.flows.set(key, {
      flow,
      guildId,
      userId,
      expiresAt: flow.expiresAt
    });
  }

  private flowKey(guildId: string | null, userId: string): string | null {
    return guildId ? `${guildId}:${userId}` : null;
  }

  private now(): number {
    return Date.now();
  }
}

export function registerInteractionHandler(client: Client, router: CommandRouter): void {
  client.on(Events.InteractionCreate, (interaction) => {
    void router.handle(interaction);
  });
}
