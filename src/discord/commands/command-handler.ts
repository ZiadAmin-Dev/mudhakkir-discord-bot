/*
Discord command contracts.
Explain: The router depends only on these interfaces. Flows own their own step
state; the router owns which flow is active for a guild/user pair.
*/

import type {
  ButtonInteraction,
  ChannelSelectMenuInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  RoleSelectMenuInteraction,
  StringSelectMenuInteraction
} from 'discord.js';

export type ComponentInteraction =
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ChannelSelectMenuInteraction
  | RoleSelectMenuInteraction
  | ModalSubmitInteraction;

export interface InteractionFlow {
  readonly name: 'setup' | 'settings';
  readonly expiresAt: number;
  handle(interaction: ComponentInteraction): Promise<void>;
}

export interface ICommandHandler {
  readonly name: string;
  readonly requiresAdmin: boolean;
  execute(interaction: ChatInputCommandInteraction): Promise<InteractionFlow | void>;
}
