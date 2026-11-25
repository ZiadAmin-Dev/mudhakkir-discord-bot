/*
Discord text message adapter.
Explain: Presentation-layer implementation of the reminders module's sender
port. It resolves the configured channel, verifies permissions, and applies the
exact allowed-mentions payload built by the domain layer.
*/

import { injectable, inject } from 'tsyringe';
import { Client, PermissionFlagsBits } from 'discord.js';
import { TOKENS } from '../shared/di/tokens.js';
import { ITextMessageSender, TextMessagePayload } from '../modules/reminders/index.js';
import { textChannelNotFoundError, textChannelPermissionError } from './discord.errors.js';

const REQUIRED_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.MentionEveryone
];

@injectable()
export class DiscordMessageSender implements ITextMessageSender {
  constructor(@inject(TOKENS.DiscordClient) private readonly client: Client) {}

  async send(payload: TextMessagePayload): Promise<void> {
    const channel = await this.client.channels.fetch(payload.channelId);
    if (!channel || !channel.isTextBased() || !('send' in channel)) {
      throw textChannelNotFoundError;
    }

    const botUser = this.client.user;
    if (!botUser || !('permissionsFor' in channel)) {
      throw textChannelPermissionError;
    }

    const permissions = channel.permissionsFor(botUser);
    if (!permissions || !permissions.has(REQUIRED_PERMISSIONS)) {
      throw textChannelPermissionError;
    }

    await channel.send({
      content: payload.content,
      allowedMentions: payload.allowedMentions
    });
  }
}
