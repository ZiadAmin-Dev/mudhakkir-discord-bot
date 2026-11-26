import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PermissionFlagsBits } from 'discord.js';
import { Clock } from '../../src/shared/clock.js';
import { createDatabase, runMigrations } from '../../src/infrastructure/persistence/storage.js';
import {
  CreateGuildSettingsInput,
  SettingsService,
  SettingsStore
} from '../../src/modules/settings/index.js';
import {
  DeliveryLedger,
  DeliveryLedgerStore,
  SchedulingService
} from '../../src/modules/scheduling/index.js';
import {
  ITextMessageSender,
  TextAnnouncementService,
  TextMessagePayload
} from '../../src/modules/reminders/index.js';
import { PrayerTimesService } from '../../src/modules/prayer-times/index.js';
import { CommandAuthorization } from '../../src/discord/authorization.js';
import { TestCommand } from '../../src/discord/commands/test.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../src/infrastructure/persistence/migrations');

class FakeClock implements Clock {
  now(): Date {
    return new Date('2026-11-25T00:00:00.000Z');
  }
}

class FakeSender implements ITextMessageSender {
  readonly sent: TextMessagePayload[] = [];

  async send(payload: TextMessagePayload): Promise<void> {
    this.sent.push(payload);
  }
}

const input: CreateGuildSettingsInput = {
  guildId: 'guild-1',
  enabled: true,
  cityName: 'Cairo',
  countryName: 'Egypt',
  latitude: 30.0444,
  longitude: 31.2357,
  timezone: 'Africa/Cairo',
  calculationMethod: 'Egyptian',
  textChannelId: 'channel-1',
  mentionType: 'everyone',
  mentionRoleId: null,
  voiceLeadTimeMinutes: 10,
  includePrivateVoice: false
};

describe('/test isolation (Milestone 7)', () => {
  it('does not write the ledger, alter the schedule, or change settings', async () => {
    const db = createDatabase(':memory:');
    runMigrations(db, migrationsDir);
    const settingsService = new SettingsService(new SettingsStore(db));
    settingsService.saveSettings(input);

    const clock = new FakeClock();
    const sender = new FakeSender();
    const scheduler = new SchedulingService(
      settingsService,
      new PrayerTimesService(),
      new DeliveryLedger(new DeliveryLedgerStore(db), clock),
      clock,
      () => {}
    );
    const command = new TestCommand(
      new CommandAuthorization(),
      settingsService,
      new TextAnnouncementService(sender),
      { runCycle: async () => {} }
    );

    const replies: string[] = [];
    const interaction = {
      guildId: 'guild-1',
      user: { id: 'user-1' },
      memberPermissions: {
        has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
      },
      options: { getString: (name: string) => (name === 'type' ? 'text' : 'fajr') },
      reply: async (payload: { content: string }) => {
        replies.push(payload.content);
      },
      deferReply: async () => {},
      editReply: async (payload: { content: string }) => {
        replies.push(payload.content);
      }
    } as never;

    try {
      scheduler.start();
      const beforeEvents = scheduler.getPendingEvents().map((event) => event.eventKey);
      const beforeSettings = JSON.stringify(settingsService.getSettings('guild-1'));
      const countLedger = (): number =>
        (db.prepare('SELECT COUNT(*) AS count FROM delivery_ledger').get() as { count: number }).count;
      const beforeCount = countLedger();

      await command.execute(interaction);

      assert.equal(sender.sent.length, 1);
      assert.match(sender.sent[0].content, /^\[TEST\]/);
      assert.deepEqual(sender.sent[0].allowedMentions, { parse: [], roles: [] });
      assert.equal(countLedger(), beforeCount);
      assert.deepEqual(scheduler.getPendingEvents().map((event) => event.eventKey), beforeEvents);
      assert.equal(JSON.stringify(settingsService.getSettings('guild-1')), beforeSettings);
      assert.match(replies.at(-1) ?? '', /delivery ledger were not modified/);
    } finally {
      scheduler.stop();
      db.close();
    }
  });
});
