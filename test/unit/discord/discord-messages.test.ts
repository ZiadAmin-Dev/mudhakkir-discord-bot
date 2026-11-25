import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'discord.js';
import { DiscordMessageSender } from '../../../src/discord/discord-messages.js';
import {
  textChannelNotFoundError,
  textChannelPermissionError
} from '../../../src/discord/discord.errors.js';
import { TextMessagePayload } from '../../../src/modules/reminders/index.js';

const payload: TextMessagePayload = {
  channelId: 'channel-1',
  content: "@everyone — It's time for Fajr prayer.",
  allowedMentions: { parse: ['everyone'] }
};

class FakeChannel {
  readonly sent: unknown[] = [];
  hasPermissions = true;

  isTextBased(): boolean {
    return true;
  }

  permissionsFor(): { has: (permissions: unknown) => boolean } {
    return { has: () => this.hasPermissions };
  }

  async send(options: unknown): Promise<void> {
    this.sent.push(options);
  }
}

function makeClient(channel: unknown, withUser = true): Client {
  return {
    user: withUser ? { id: 'bot' } : null,
    channels: { fetch: async () => channel }
  } as unknown as Client;
}

describe('Discord message sender (Milestone 5)', () => {
  it('sends the exact payload when the channel and permissions are valid', async () => {
    const channel = new FakeChannel();
    await new DiscordMessageSender(makeClient(channel)).send(payload);

    assert.deepEqual(channel.sent, [
      { content: payload.content, allowedMentions: payload.allowedMentions }
    ]);
  });

  it('throws the named error when the channel is missing', async () => {
    await assert.rejects(
      () => new DiscordMessageSender(makeClient(null)).send(payload),
      (error: unknown) => error === textChannelNotFoundError
    );
  });

  it('throws the named error when required permissions are missing', async () => {
    const channel = new FakeChannel();
    channel.hasPermissions = false;

    await assert.rejects(
      () => new DiscordMessageSender(makeClient(channel)).send(payload),
      (error: unknown) => error === textChannelPermissionError
    );
  });

  it('throws the named error when the bot user is unavailable', async () => {
    await assert.rejects(
      () => new DiscordMessageSender(makeClient(new FakeChannel(), false)).send(payload),
      (error: unknown) => error === textChannelPermissionError
    );
  });
});
