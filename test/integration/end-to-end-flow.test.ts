import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Clock } from '../../src/shared/clock.js';
import { InMemoryTaskTracker } from '../../src/shared/lifecycle/task-tracker.js';
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
  SchedulingService
} from '../../src/modules/scheduling/index.js';
import {
  ITextMessageSender,
  IVoiceChannelDirectory,
  IVoiceTransport,
  ReminderHandler,
  TextAnnouncementService,
  TextMessagePayload,
  VoiceAnnouncementService,
  VoiceChannelSnapshot,
  VoiceCoordinator
} from '../../src/modules/reminders/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../src/infrastructure/persistence/migrations');
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

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

const channel: VoiceChannelSnapshot = {
  id: 'voice-1',
  guildId: 'guild-1',
  name: 'Prayer',
  isGuildVoice: true,
  canView: true,
  canConnect: true,
  canSpeak: true,
  humanCount: 1,
  hiddenFromEveryone: false
};

const fakeDirectory: IVoiceChannelDirectory = {
  async list() {
    return [channel];
  },
  async get() {
    return channel;
  }
};

class FakeTransport implements IVoiceTransport {
  readonly announced: string[] = [];
  async announce(input: { prayer: string }): Promise<void> {
    this.announced.push(input.prayer);
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
  textChannelId: 'text-1',
  mentionType: 'everyone',
  mentionRoleId: null,
  voiceLeadTimeMinutes: 10,
  includePrivateVoice: false
};

describe('End-to-end prayer flow (Milestone 8)', () => {
  it('calculates a full day, delivers both paths once, and does not replay after restart', async () => {
    const db = createDatabase(':memory:');
    runMigrations(db, migrationsDir);
    const settingsService = new SettingsService(new SettingsStore(db));
    settingsService.saveSettings(input);

    const clock = new FakeClock(new Date('2026-11-25T00:00:00.000Z'));
    const sender = new FakeSender();
    const transport = new FakeTransport();
    const tracker = new InMemoryTaskTracker();
    const handler = new ReminderHandler(
      settingsService,
      new TextAnnouncementService(sender),
      new VoiceAnnouncementService(fakeDirectory, transport, new VoiceCoordinator()),
      tracker
    );
    const scheduler = new SchedulingService(
      settingsService,
      new PrayerTimesService(),
      new DeliveryLedger(new DeliveryLedgerStore(db), clock),
      clock,
      (event) => handler.handle(event)
    );

    try {
      scheduler.start();

      for (let i = 0; i < 20; i += 1) {
        const next = scheduler.getPendingEvents().find((event) => event.prayerDate === '2026-11-25');
        if (!next) {
          break;
        }
        clock.set(next.triggerAt.toISOString());
        scheduler.tick();
        await flush();
      }

      const ledgerCount = (db.prepare('SELECT COUNT(*) AS count FROM delivery_ledger').get() as { count: number }).count;
      assert.equal(ledgerCount, 10);
      assert.equal(sender.sent.length, 5);
      assert.equal(transport.announced.length, 5);
      assert.equal(new Set(transport.announced).size, 5);

      // Restart with the same database and a later clock.
      clock.set('2026-11-26T12:00:00.000Z');
      const restarted = new SchedulingService(
        settingsService,
        new PrayerTimesService(),
        new DeliveryLedger(new DeliveryLedgerStore(db), clock),
        clock,
        (event) => handler.handle(event)
      );
      try {
        restarted.start();
        assert.equal(
          restarted.getPendingEvents().some((event) => event.prayerDate === '2026-11-25'),
          false
        );
        restarted.tick();
        await flush();
        assert.equal(sender.sent.length, 5);
        assert.equal(transport.announced.length, 5);
      } finally {
        restarted.stop();
      }
    } finally {
      scheduler.stop();
      db.close();
    }
  });
});
