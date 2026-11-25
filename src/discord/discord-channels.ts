/*
Voice channel directory adapter.
Explain: Reads guild voice channels and turns them into plain snapshots for the
domain. Privacy is a permission fact (@everyone cannot view), never a name guess.
*/

import { injectable, inject } from 'tsyringe';
import { ChannelType, Client, PermissionFlagsBits } from 'discord.js';
import { TOKENS } from '../shared/di/tokens.js';
import { IVoiceChannelDirectory, VoiceChannelSnapshot } from '../modules/reminders/index.js';

@injectable()
export class DiscordVoiceDirectory implements IVoiceChannelDirectory {
  constructor(@inject(TOKENS.DiscordClient) private readonly client: Client) {}

  async list(guildId: string): Promise<VoiceChannelSnapshot[]> {
    const guild = await this.client.guilds.fetch(guildId);
    const channels = await guild.channels.fetch();
    const botId = this.client.user?.id;
    const snapshots: VoiceChannelSnapshot[] = [];

    for (const channel of channels.values()) {
      if (!channel || channel.type !== ChannelType.GuildVoice) {
        continue;
      }

      const botPermissions = botId ? channel.permissionsFor(botId) : null;
      const everyonePermissions = channel.permissionsFor(guild.roles.everyone);

      snapshots.push({
        id: channel.id,
        guildId,
        name: channel.name,
        isGuildVoice: true,
        canView: botPermissions?.has(PermissionFlagsBits.ViewChannel) ?? false,
        canConnect: botPermissions?.has(PermissionFlagsBits.Connect) ?? false,
        canSpeak: botPermissions?.has(PermissionFlagsBits.Speak) ?? false,
        humanCount: channel.members.filter((member) => !member.user.bot).size,
        hiddenFromEveryone: !(everyonePermissions?.has(PermissionFlagsBits.ViewChannel) ?? false)
      });
    }

    return snapshots;
  }

  async get(guildId: string, channelId: string): Promise<VoiceChannelSnapshot | null> {
    const channels = await this.list(guildId);
    return channels.find((channel) => channel.id === channelId) ?? null;
  }
}
