import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Clock } from '../../src/shared/clock.js';
import { createDatabase, runMigrations } from '../../src/infrastructure/persistence/storage.js';
import {
  CreateGuildSettingsInput,
  SettingsService,
  SettingsStore
} from '../../src/modules/settings/index.js';
import { PrayerTimesService } from '../../src/modules/prayer-times/index.js';
import {
  DeliveryLedger,
  DeliveryLedgerStore,
  PrayerEvent,
  SchedulingService
} from '../../src/modules/scheduling/index.js';
import {
  ITextMessageSender,
  ReminderHandler,
  TextAnnouncementService,
  TextMessagePayload
} from '../../src/modules/reminders/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../src/infrastructure/persistence/migrations');

class FakeClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  set(iso: string): void {
    this.current = new Date(iso);
  }
}

class FakeSender implements ITextMessageSender {
  readonly sent: TextMessagePayload[] = [];

  async send(payload: TextMessagePayload): Promise<void> {
    this.sent.push(payload);
  }
}

const cairo: CreateGuildSettingsInput = {
  guildId: '123456789012345678',
  enabled: true,
  cityName: 'Cairo',
  countryName: 'Egypt',
  latitude: 30.0444,
  longitude: 31.2357,
  timezone: 'Africa/Cairo',
  calculationMethod: 'Egyptian',
  textChannelId: '987654321098765432',
  mentionType: 'role',
  mentionRoleId: '555555555555555555',
  voiceLeadTimeMinutes: 10,
  includePrivateVoice: false
};

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('Scheduler → reminder handler → text delivery (Milestone 5)', () => {
  it('delivers a reached event once with the configured role mention', async () => {
    const db = createDatabase(':memory:');
    runMigrations(db, migrationsDir);
    const settingsService = new SettingsService(new SettingsStore(db));
    settingsService.saveSettings(cairo);

    const clock = new FakeClock(new Date('2026-11-25T00:00:00.000Z'));
    const sender = new FakeSender();
    const handler = new ReminderHandler(settingsService, new TextAnnouncementService(sender));
    const scheduler = new SchedulingService(
      settingsService,
      new PrayerTimesService(),
      new DeliveryLedger(new DeliveryLedgerStore(db), clock),
      clock,
      (event: PrayerEvent) => handler.handle(event)
    );

    try {
      scheduler.start();
      const reached = scheduler
        .getPendingEvents()
        .find(
          (event) =>
            event.eventType === 'PRAYER_TIME_REACHED' &&
            event.prayer === 'fajr' &&
            event.prayerDate === '2026-11-25'
        )!;
      clock.set(reached.triggerAt.toISOString());

      scheduler.tick();
      await flush();

      assert.equal(sender.sent.length, 1);
      assert.deepEqual(sender.sent[0], {
        channelId: cairo.textChannelId,
        content: "<@&555555555555555555> — It's time for Fajr prayer.",
        allowedMentions: { parse: [], roles: ['555555555555555555'] }
      });

      scheduler.tick();
      await flush();
      assert.equal(sender.sent.length, 1);
    } finally {
      scheduler.stop();
      db.close();
    }
  });

  it('sends nothing for disabled guilds', async () => {
    const db = createDatabase(':memory:');
    runMigrations(db, migrationsDir);
    const settingsService = new SettingsService(new SettingsStore(db));
    settingsService.saveSettings({ ...cairo, enabled: false });

    const clock = new FakeClock(new Date('2026-11-25T00:00:00.000Z'));
    const sender = new FakeSender();
    const scheduler = new SchedulingService(
      settingsService,
      new PrayerTimesService(),
      new DeliveryLedger(new DeliveryLedgerStore(db), clock),
      clock,
      (event: PrayerEvent) =>
        new ReminderHandler(settingsService, new TextAnnouncementService(sender)).handle(event)
    );

    try {
      scheduler.start();
      assert.equal(scheduler.getPendingEvents().length, 0);
      scheduler.tick();
      await flush();
      assert.equal(sender.sent.length, 0);
    } finally {
      scheduler.stop();
      db.close();
    }
  });
});
