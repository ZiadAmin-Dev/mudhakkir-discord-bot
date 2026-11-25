import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
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
  DeliveryLedgerEntry,
  DeliveryLedgerStore,
  PrayerEvent,
  SchedulingService
} from '../../src/modules/scheduling/index.js';

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

const cairo: CreateGuildSettingsInput = {
  guildId: '111111111111111111',
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

const london: CreateGuildSettingsInput = {
  ...cairo,
  guildId: '222222222222222222',
  cityName: 'London',
  countryName: 'United Kingdom',
  latitude: 51.5074,
  longitude: -0.1278,
  timezone: 'Europe/London',
  calculationMethod: 'MuslimWorldLeague'
};

function entry(event: PrayerEvent): DeliveryLedgerEntry {
  return {
    eventKey: event.eventKey,
    guildId: event.guildId,
    prayerDate: event.prayerDate,
    prayerName: event.prayer,
    eventType: event.eventType,
    deliveredAt: '2026-11-25T00:00:00.000Z'
  };
}

describe('Scheduling & persistence integration (Milestone 4)', () => {
  it('persists ledger keys and prunes only old rows', () => {
    const db = createDatabase(':memory:');
    runMigrations(db, migrationsDir);
    const store = new DeliveryLedgerStore(db);
    const clock = new FakeClock(new Date('2026-11-25T00:00:00.000Z'));
    const ledger = new DeliveryLedger(store, clock);
    const sample = entry({
      eventKey: 'g:2026-11-25:fajr:PRAYER_TIME_REACHED',
      guildId: 'g',
      prayerDate: '2026-11-25',
      prayer: 'fajr',
      eventType: 'PRAYER_TIME_REACHED',
      triggerAt: new Date('2026-11-25T02:57:00.000Z')
    });

    assert.equal(ledger.commit(sample), true);
    assert.equal(ledger.commit(sample), false);
    assert.equal(store.has(sample.eventKey), true);

    clock.set('2026-12-03T00:00:00.000Z');
    assert.equal(ledger.prune(7), 1);
    assert.equal(store.has(sample.eventKey), false);
    db.close();
  });

  it('does not replay dispatched events after a restart', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mudhakkir-scheduler-'));
    const dbPath = path.join(tempDir, 'mudhakkir.db');
    let db = createDatabase(dbPath);
    runMigrations(db, migrationsDir);

    const settingsService = new SettingsService(new SettingsStore(db));
    settingsService.saveSettings(cairo);
    const prayerTimes = new PrayerTimesService();
    const clock = new FakeClock(new Date('2026-11-25T00:00:00.000Z'));
    const ledgerStore = new DeliveryLedgerStore(db);
    const ledger = new DeliveryLedger(ledgerStore, clock);
    const dispatched: PrayerEvent[] = [];
    const firstRun = new SchedulingService(settingsService, prayerTimes, ledger, clock, (event) =>
      dispatched.push(event)
    );

    try {
      firstRun.start();
      const first = firstRun.getPendingEvents()[0];
      clock.set(first.triggerAt.toISOString());
      firstRun.tick();
      assert.equal(dispatched.length, 1);
      assert.equal(ledgerStore.has(first.eventKey), true);
      firstRun.stop();
      db.close();

      // Restart: same database, new in-memory plan, clock advanced past the event.
      db = createDatabase(dbPath);
      runMigrations(db, migrationsDir);
      const restartedSettings = new SettingsService(new SettingsStore(db));
      const restartedLedger = new DeliveryLedger(new DeliveryLedgerStore(db), clock);
      const restartedDispatched: PrayerEvent[] = [];
      const secondRun = new SchedulingService(
        restartedSettings,
        prayerTimes,
        restartedLedger,
        clock,
        (event) => restartedDispatched.push(event)
      );

      try {
        clock.set(new Date(first.triggerAt.getTime() + 60 * 60_000).toISOString());
        secondRun.start();
        assert.equal(secondRun.getPendingEvents().some((event) => event.eventKey === first.eventKey), false);
        secondRun.tick();
        assert.equal(restartedDispatched.length, 0);
      } finally {
        secondRun.stop();
      }
    } finally {
      if (db.open) {
        db.close();
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('merges enabled guilds into one ordered timeline and excludes disabled guilds', () => {
    const db = createDatabase(':memory:');
    runMigrations(db, migrationsDir);
    const settingsService = new SettingsService(new SettingsStore(db));
    settingsService.saveSettings(cairo);
    settingsService.saveSettings(london);
    settingsService.saveSettings({ ...cairo, guildId: '333333333333333333', enabled: false });

    const clock = new FakeClock(new Date('2026-11-25T00:00:00.000Z'));
    const ledger = new DeliveryLedger(new DeliveryLedgerStore(db), clock);
    const scheduler = new SchedulingService(
      settingsService,
      new PrayerTimesService(),
      ledger,
      clock,
      () => {}
    );

    try {
      scheduler.start();
      const plan = scheduler.getPendingEvents();
      assert.equal(new Set(plan.map((event) => event.guildId)).size, 2);
      assert.equal(plan.some((event) => event.guildId === '333333333333333333'), false);
      const triggers = plan.map((event) => event.triggerAt.getTime());
      assert.deepEqual(triggers, [...triggers].sort((a, b) => a - b));
    } finally {
      scheduler.stop();
      db.close();
    }
  });
});
