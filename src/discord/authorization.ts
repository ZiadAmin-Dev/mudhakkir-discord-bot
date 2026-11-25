/*
Command authorization.
Explain: Application-level access checks use authoritative values from the
Discord interaction, never user-supplied IDs. Discord UI permissions are not a
security boundary.
*/

import { injectable } from 'tsyringe';
import { PermissionFlagsBits } from 'discord.js';

export interface InteractionContext {
  guildId: string | null;
  user: { id: string };
  memberPermissions?: { has: (permission: bigint) => boolean } | null;
}

@injectable()
export class CommandAuthorization {
  isInGuild(interaction: InteractionContext): boolean {
    return interaction.guildId !== null;
  }

  /** BR-063/BR-064: configuration commands require Administrator or ManageGuild. */
  canConfigure(interaction: InteractionContext): boolean {
    if (!this.isInGuild(interaction)) {
      return false;
    }
    const permissions = interaction.memberPermissions;
    return (
      permissions?.has(PermissionFlagsBits.Administrator) === true ||
      permissions?.has(PermissionFlagsBits.ManageGuild) === true
    );
  }
}
