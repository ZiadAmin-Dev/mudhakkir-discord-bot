/*
Slash command registration.
Explain: Discord-side definition of the command surface. Server-side
authorization remains authoritative; default_member_permissions only hides
commands in Discord's UI.
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

export async function registerSlashCommands(
  clientId: string,
  token: string,
  logger?: Logger,
  guildId?: string
): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);
  const route = guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId);
  await rest.put(route, { body: buildSlashCommands().map((command) => command.toJSON()) });
  logger?.info({ scope: guildId ? 'guild' : 'global', guildId }, 'Slash commands registered');
}
