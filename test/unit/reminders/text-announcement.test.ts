import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTextAnnouncement,
  missingRoleMentionError,
  TextAnnouncementService,
  TextMessagePayload,
  ITextMessageSender
} from '../../../src/modules/reminders/index.js';
import { GuildSettings } from '../../../src/modules/settings/index.js';

const settings: GuildSettings = {
  guildId: '123456789012345678',
  enabled: true,
  cityName: 'Cairo',
  countryName: 'Egypt',
  latitude: 30.0444,
  longitude: 31.2357,
  timezone: 'Africa/Cairo',
  calculationMethod: 'Egyptian',
  textChannelId: '987654321098765432',
  mentionType: 'everyone',
  mentionRoleId: null,
  voiceLeadTimeMinutes: 10,
  includePrivateVoice: false,
  updatedAt: '2026-11-25T00:00:00.000Z'
};

class FakeSender implements ITextMessageSender {
  readonly sent: TextMessagePayload[] = [];
  fail = false;

  async send(payload: TextMessagePayload): Promise<void> {
    if (this.fail) {
      throw new Error('send failed');
    }
    this.sent.push(payload);
  }
}

describe('Text announcements (Milestone 5)', () => {
  it('builds an @everyone announcement with exact allowed mentions', () => {
    const result = buildTextAnnouncement('fajr', settings);

    assert.equal(result.content, "@everyone — It's time for Fajr prayer.");
    assert.deepEqual(result.allowedMentions, { parse: ['everyone'] });
  });

  it('builds a role announcement with exactly one role and no @everyone', () => {
    const result = buildTextAnnouncement('maghrib', {
      ...settings,
      mentionType: 'role',
      mentionRoleId: '555555555555555555'
    });

    assert.equal(result.content, "<@&555555555555555555> — It's time for Maghrib prayer.");
    assert.deepEqual(result.allowedMentions, { parse: [], roles: ['555555555555555555'] });
  });

  it('rejects a role mention without a role id', () => {
    assert.throws(
      () => buildTextAnnouncement('asr', { ...settings, mentionType: 'role', mentionRoleId: null }),
      (error: unknown) => error === missingRoleMentionError
    );
  });

  it('delegates a complete payload to the sender', async () => {
    const sender = new FakeSender();
    const service = new TextAnnouncementService(sender);

    await service.send('dhuhr', settings);

    assert.deepEqual(sender.sent, [
      {
        channelId: settings.textChannelId,
        content: "@everyone — It's time for Dhuhr prayer.",
        allowedMentions: { parse: ['everyone'] }
      }
    ]);
  });

  it('contains sender failures instead of propagating them', async () => {
    const sender = new FakeSender();
    sender.fail = true;
    const service = new TextAnnouncementService(sender);

    await service.send('isha', settings); // must not reject
    assert.equal(sender.sent.length, 0);
  });
});
