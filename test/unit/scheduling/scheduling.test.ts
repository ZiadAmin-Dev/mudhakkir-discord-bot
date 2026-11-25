import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Clock } from '../../../src/shared/clock.js';
import { createDatabase, runMigrations } from '../../../src/infrastructure/persistence/storage.js';
import {
  CreateGuildSettingsInput,
  SettingsService,
  SettingsStore
} from '../../../src/modules/settings/index.js';
import {
  DailyPrayerTimes,
  IPrayerTimesService,
  PrayerTimesInput,
  PrayerTimesService
} from '../../../src/modules/prayer-times/index.js';
import {
  buildEvents,
  createEventKey,
  DeliveryLedger,
  IDeliveryLedgerStore,
  DeliveryLedgerEntry,
  LATE_EVENT_GRACE_MS,
  localDateInZone,
  nextLocalDate,
  PrayerEvent,
  SchedulingService
} from '../../../src/modules/scheduling/index.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../../src/infrastructure/persistence/migrations');

class FakeClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  set(iso: string): void {
    this.current = new Date(iso);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

class MemoryLedgerStore implements IDeliveryLedgerStore {
  readonly entries = new Map<string, DeliveryLedgerEntry>();

  has(eventKey: string): boolean {
    return this.entries.has(eventKey);
  }

  insert(entry: DeliveryLedgerEntry): boolean {
    if (this.entries.has(entry.eventKey)) {
      return false;
    }
    this.entries.set(entry.eventKey, entry);
    return true;
  }

  prune(cutoff: string): number {
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.deliveredAt < cutoff) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}

class FailingLedgerStore extends MemoryLedgerStore {
  override insert(): boolean {
    throw new Error('ledger unavailable');
  }
}

class PartialTimesService {
  calculate(input: PrayerTimesInput): DailyPrayerTimes {
    if (input.date === '2026-06-22') {
      throw new Error('no twilight');
    }
    const noon = Date.parse(`${input.date}T12:00:00.000Z`);
    return {
      date: input.date,
      timezone: input.timezone,
      calculationMethod: input.calculationMethod,
      prayers: [
        { prayer: 'fajr', instant: new Date(noon), localTime: '14:00' },
        { prayer: 'dhuhr', instant: new Date(noon + 3_600_000), localTime: '15:00' }
      ]
    };
  }
}

const prayerTimes = new PrayerTimesService();
const cairoInput: CreateGuildSettingsInput = {
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
  includePrivateVoice: false
};

function makeSettings(overrides: Partial<CreateGuildSettingsInput> = {}): CreateGuildSettingsInput {
  return { ...cairoInput, ...overrides };
}

function makeServiceStore(): { service: SettingsService; db: ReturnType<typeof createDatabase> } {
  const db = createDatabase(':memory:');
  runMigrations(db, migrationsDir);
  return { service: new SettingsService(new SettingsStore(db)), db };
}

describe('Prayer scheduling (Milestone 4)', () => {
  describe('event builder', () => {
    it('builds two days of future events with stable keys', () => {
      const settings = { ...makeSettings(), updatedAt: '' };
      const now = new Date('2026-11-25T00:00:00.000Z');
      const events = buildEvents({ settings, now, prayerTimes });

      assert.equal(events.length, 20);
      assert.deepEqual(new Set(events.map((event) => event.prayerDate)), new Set(['2026-11-25', '2026-11-26']));
      assert.ok(events.every((event) => event.triggerAt.getTime() > now.getTime()));
      const triggers = events.map((event) => event.triggerAt.getTime());
      assert.deepEqual(triggers, [...triggers].sort((a, b) => a - b));
      assert.equal(events[0].eventKey, createEventKey(settings.guildId, '2026-11-25', 'fajr', 'PRAYER_APPROACHING'));
    });

    it('sets approaching triggers to the prayer instant minus the lead time', () => {
      const settings = { ...makeSettings({ voiceLeadTimeMinutes: 15 }), updatedAt: '' };
      const now = new Date('2026-11-25T00:00:00.000Z');
      const events = buildEvents({ settings, now, prayerTimes });
      const daily = prayerTimes.calculate({
        date: '2026-11-25',
        latitude: settings.latitude,
        longitude: settings.longitude,
        timezone: settings.timezone,
        calculationMethod: settings.calculationMethod
      });
      const dhuhr = daily.prayers.find((prayer) => prayer.prayer === 'dhuhr')!;
      const approaching = events.find(
        (event) => event.prayer === 'dhuhr' && event.eventType === 'PRAYER_APPROACHING'
      )!;
      const reached = events.find(
        (event) => event.prayer === 'dhuhr' && event.eventType === 'PRAYER_TIME_REACHED'
      )!;

      assert.equal(approaching.triggerAt.getTime(), dhuhr.instant.getTime() - 15 * 60_000);
      assert.equal(reached.triggerAt.getTime(), dhuhr.instant.getTime());
    });

    it('drops triggers already in the past', () => {
      const settings = { ...makeSettings(), updatedAt: '' };
      const now = new Date('2026-11-25T12:00:00.000Z');
      const events = buildEvents({ settings, now, prayerTimes });

      assert.ok(events.length > 0);
      assert.ok(events.every((event) => event.triggerAt.getTime() > now.getTime()));
      assert.equal(
        events.some((event) => event.prayerDate === '2026-11-25' && event.prayer === 'fajr'),
        false
      );
      assert.equal(
        events.some((event) => event.prayerDate === '2026-11-25' && event.prayer === 'dhuhr'),
        false
      );
    });

    it('advances by local calendar date across DST and calendar boundaries', () => {
      assert.equal(localDateInZone(new Date('2026-03-28T23:00:00.000Z'), 'Europe/London'), '2026-03-28');
      assert.equal(nextLocalDate('2026-03-28'), '2026-03-29');
      assert.equal(nextLocalDate('2026-12-31'), '2027-01-01');
      assert.equal(nextLocalDate('2028-02-28'), '2028-02-29');

      const settings = {
        ...makeSettings({
          latitude: 51.5074,
          longitude: -0.1278,
          timezone: 'Europe/London',
          calculationMethod: 'MuslimWorldLeague' as const
        }),
        updatedAt: ''
      };
      const events = buildEvents({
        settings,
        now: new Date('2026-03-28T23:00:00.000Z'),
        prayerTimes
      });
      const dhuhrOnTransition = events.find(
        (event) => event.prayerDate === '2026-03-29' && event.prayer === 'dhuhr' && event.eventType === 'PRAYER_TIME_REACHED'
      )!;

      assert.equal(dhuhrOnTransition.triggerAt.toISOString(), '2026-03-29T12:06:00.000Z');
      assert.equal(events.some((event) => event.prayerDate === '2026-03-30'), false);
    });

    it('skips an uncalculable date without losing the other date', () => {
      const settings = {
        ...makeSettings({
          latitude: 89,
          longitude: 0,
          timezone: 'Arctic/Longyearbyen',
          calculationMethod: 'Egyptian' as const,
          voiceLeadTimeMinutes: 0
        }),
        updatedAt: ''
      };
      // The clock is after the fake service's noon instants, so keep it early.
      const now = new Date('2026-06-21T00:00:00.000Z');
      const events = buildEvents({
        settings,
        now,
        prayerTimes: new PartialTimesService() as unknown as IPrayerTimesService
      });

      assert.equal(events.length, 4); // two prayers × approaching + reached
      assert.ok(events.every((event) => event.prayerDate === '2026-06-21'));
    });
  });

  describe('delivery ledger', () => {
    it('commits a key at most once and prunes old rows', () => {
      const store = new MemoryLedgerStore();
      const clock = new FakeClock(new Date('2026-11-25T00:00:00.000Z'));
      const ledger = new DeliveryLedger(store, clock);
      const entry: DeliveryLedgerEntry = {
        eventKey: 'g:2026-11-25:fajr:PRAYER_TIME_REACHED',
        guildId: 'g',
        prayerDate: '2026-11-25',
        prayerName: 'fajr',
        eventType: 'PRAYER_TIME_REACHED',
        deliveredAt: clock.now().toISOString()
      };

      assert.equal(ledger.isHandled(entry.eventKey), false);
      assert.equal(ledger.commit(entry), true);
      assert.equal(ledger.isHandled(entry.eventKey), true);
      assert.equal(ledger.commit(entry), false);

      clock.advance(8 * 86_400_000);
      assert.equal(ledger.prune(7), 1);
      assert.equal(ledger.isHandled(entry.eventKey), false);
    });
  });

  describe('scheduler', () => {
    it('dispatches a due event once and advances to the next event', () => {
      const { service: settingsService, db } = makeServiceStore();
      settingsService.saveSettings(cairoInput);
      const clock = new FakeClock(new Date('2026-11-25T00:00:00.000Z'));
      const ledger = new DeliveryLedger(new MemoryLedgerStore(), clock);
      const dispatched: PrayerEvent[] = [];
      const scheduler = new SchedulingService(
        settingsService,
        prayerTimes,
        ledger,
        clock,
        (event) => dispatched.push(event)
      );

      try {
        scheduler.start();
        const first = scheduler.getPendingEvents()[0];
        clock.set(first.triggerAt.toISOString());
        scheduler.tick();

        assert.deepEqual(dispatched.map((event) => event.eventKey), [first.eventKey]);
        assert.equal(ledger.isHandled(first.eventKey), true);
        assert.equal(scheduler.getPendingEvents().some((event) => event.eventKey === first.eventKey), false);

        scheduler.tick();
        assert.equal(dispatched.length, 1);
      } finally {
        scheduler.stop();
        db.close();
      }
    });

    it('skips an event dispatched beyond the late-event grace window', () => {
      const { service: settingsService, db } = makeServiceStore();
      settingsService.saveSettings(cairoInput);
      const clock = new FakeClock(new Date('2026-11-25T00:00:00.000Z'));
      const ledger = new DeliveryLedger(new MemoryLedgerStore(), clock);
      const dispatched: PrayerEvent[] = [];
      const scheduler = new SchedulingService(settingsService, prayerTimes, ledger, clock, (event) =>
        dispatched.push(event)
      );

      try {
        scheduler.start();
        const first = scheduler.getPendingEvents()[0];
        clock.set(new Date(first.triggerAt.getTime() + LATE_EVENT_GRACE_MS + 1000).toISOString());
        scheduler.tick();

        assert.equal(dispatched.length, 0);
        assert.equal(ledger.isHandled(first.eventKey), false);
      } finally {
        scheduler.stop();
        db.close();
      }
    });

    it('does not dispatch when the ledger commit fails', () => {
      const { service: settingsService, db } = makeServiceStore();
      settingsService.saveSettings(cairoInput);
      const clock = new FakeClock(new Date('2026-11-25T00:00:00.000Z'));
      const ledger = new DeliveryLedger(new FailingLedgerStore(), clock);
      const dispatched: PrayerEvent[] = [];
      const scheduler = new SchedulingService(settingsService, prayerTimes, ledger, clock, (event) =>
        dispatched.push(event)
      );

      try {
        scheduler.start();
        clock.set(scheduler.getPendingEvents()[0].triggerAt.toISOString());
        scheduler.tick();
        assert.equal(dispatched.length, 0);
      } finally {
        scheduler.stop();
        db.close();
      }
    });

    it('rebuilds on a lead-time change and excludes disabled guilds', () => {
      const { service: settingsService, db } = makeServiceStore();
      settingsService.saveSettings(cairoInput);
      const clock = new FakeClock(new Date('2026-11-25T00:00:00.000Z'));
      const ledger = new DeliveryLedger(new MemoryLedgerStore(), clock);
      const scheduler = new SchedulingService(settingsService, prayerTimes, ledger, clock, () => {});

      try {
        scheduler.start();
        const dhuhrApproaching = () =>
          scheduler
            .getPendingEvents()
            .find((event) => event.prayer === 'dhuhr' && event.eventType === 'PRAYER_APPROACHING')!;
        const before = dhuhrApproaching().triggerAt.getTime();

        settingsService.updateSettings(cairoInput.guildId, { voiceLeadTimeMinutes: 15 });
        scheduler.rebuild(cairoInput.guildId);
        assert.equal(dhuhrApproaching().triggerAt.getTime(), before - 5 * 60_000);

        settingsService.setEnabled(cairoInput.guildId, false);
        scheduler.rebuild();
        assert.equal(scheduler.getPendingEvents().length, 0);
      } finally {
        scheduler.stop();
        db.close();
      }
    });
  });
});
