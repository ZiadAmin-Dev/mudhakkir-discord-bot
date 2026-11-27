/*
Slash command registration.
Explain: Global commands are always registered so the bot works in every guild
it is invited to. DEV_GUILD_ID (optionally comma-separated) adds guild-scoped
overrides that appear instantly in test servers. Server-side authorization
remains authoritative; default_member_permissions only hides commands in UI.
*/

import { PermissionFlagsBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import type { Logger } from '../shared/logging/logger.port.js';

const ADMIN_PERMISSIONS = PermissionFlagsBits.ManageGuild.toString();

export function buildSlashCommands() {
  const setup = new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure prayer reminders for this server')
    .setDefaultMemberPermissions(ADMIN_PERMISSIONS);

  const settings = new SlashCommandBuilder()
    .setName('settings')
    .setDescription('View or edit the current configuration')
    .setDefaultMemberPermissions(ADMIN_PERMISSIONS);

  const prayerTimes = new SlashCommandBuilder()
    .setName('prayer-times')
    .setDescription("Show today's prayer times");

  const test = new SlashCommandBuilder()
    .setName('test')
    .setDescription('Test text and voice announcements')
    .setDefaultMemberPermissions(ADMIN_PERMISSIONS)
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Which path to test')
        .addChoices(
          { name: 'text', value: 'text' },
          { name: 'voice', value: 'voice' },
          { name: 'both', value: 'both' }
        )
    )
    .addStringOption((option) =>
      option
        .setName('prayer')
        .setDescription('Prayer to use for the test')
        .addChoices(
          { name: 'fajr', value: 'fajr' },
          { name: 'dhuhr', value: 'dhuhr' },
          { name: 'asr', value: 'asr' },
          { name: 'maghrib', value: 'maghrib' },
          { name: 'isha', value: 'isha' }
        )
    );

  const enable = new SlashCommandBuilder()
    .setName('enable')
    .setDescription('Enable automated prayer reminders')
    .setDefaultMemberPermissions(ADMIN_PERMISSIONS);

  const disable = new SlashCommandBuilder()
    .setName('disable')
    .setDescription('Disable automated prayer reminders')
    .setDefaultMemberPermissions(ADMIN_PERMISSIONS);

  return [setup, prayerTimes, settings, test, enable, disable];
}

export interface RegistrationTarget {
  scope: 'global' | 'guild';
  guildId?: string;
}

/** Global commands work in every guild; dev guilds get instant overrides. */
export function registrationTargets(guildIds?: string): RegistrationTarget[] {
  const targets: RegistrationTarget[] = [{ scope: 'global' }];
  for (const guildId of (guildIds ?? '').split(',')) {
    const trimmed = guildId.trim();
    if (trimmed) {
      targets.push({ scope: 'guild', guildId: trimmed });
    }
  }
  return targets;
}

export async function registerSlashCommands(
  clientId: string,
  token: string,
  logger?: Logger,
  guildIds?: string
): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);
  const body = buildSlashCommands().map((command) => command.toJSON());

  for (const target of registrationTargets(guildIds)) {
    const route =
      target.scope === 'global'
        ? Routes.applicationCommands(clientId)
        : Routes.applicationGuildCommands(clientId, target.guildId!);
    try {
      await rest.put(route, { body });
      logger?.info({ scope: target.scope, guildId: target.guildId }, 'Slash commands registered');
    } catch (error) {
      logger?.error({ scope: target.scope, guildId: target.guildId, err: error }, 'Slash command registration failed');
    }
  }
}
