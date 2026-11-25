import 'reflect-metadata';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, runMigrations } from '../../src/infrastructure/persistence/storage.js';
import {
  CreateGuildSettingsInput,
  SettingsService,
  SettingsStore
} from '../../src/modules/settings/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../src/infrastructure/persistence/migrations');

describe('Database & Persistence (Milestone 2)', () => {
  it('should initialize SQLite with WAL mode and run migrations', () => {
    const db = createDatabase(':memory:');
    runMigrations(db, migrationsDir);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    assert.ok(tableNames.includes('schema_migrations'));
    assert.ok(tableNames.includes('guild_settings'));
    assert.ok(tableNames.includes('delivery_ledger'));

    // Check PRAGMA journal_mode is WAL or memory
    const journalMode = db.pragma('journal_mode', { simple: true });
    assert.ok(journalMode === 'wal' || journalMode === 'memory');
    db.close();
  });

  describe('SettingsStore & SettingsService', () => {
    let db: ReturnType<typeof createDatabase>;
    let store: SettingsStore;
    let service: SettingsService;

    const sampleSettingsInput: CreateGuildSettingsInput = {
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

    beforeEach(() => {
      db = createDatabase(':memory:');
      runMigrations(db, migrationsDir);
      store = new SettingsStore(db);
      service = new SettingsService(store);
    });

    it('should return null when guild settings do not exist', () => {
      const result = service.getSettings('non_existent_guild');
      assert.equal(result, null);
    });

    it('should save and retrieve guild settings accurately', () => {
      const saved = service.saveSettings(sampleSettingsInput);

      assert.equal(saved.guildId, sampleSettingsInput.guildId);
      assert.equal(saved.cityName, 'Cairo');
      assert.equal(saved.timezone, 'Africa/Cairo');
      assert.ok(saved.updatedAt);

      const retrieved = service.getSettings(sampleSettingsInput.guildId);
      assert.ok(retrieved);
      assert.equal(retrieved.guildId, sampleSettingsInput.guildId);
      assert.equal(retrieved.enabled, true);
      assert.equal(retrieved.latitude, 30.0444);
      assert.equal(retrieved.longitude, 31.2357);
      assert.equal(retrieved.calculationMethod, 'Egyptian');
      assert.equal(retrieved.mentionType, 'everyone');
      assert.equal(retrieved.voiceLeadTimeMinutes, 10);
    });

    it('should persist settings across database close and reopen', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mudhakkir-reopen-'));
      const dbPath = path.join(tempDir, 'mudhakkir.db');
      let fileDb = createDatabase(dbPath);

      try {
        runMigrations(fileDb, migrationsDir);
        const firstService = new SettingsService(new SettingsStore(fileDb));
        firstService.saveSettings(sampleSettingsInput);
        fileDb.close();

        fileDb = createDatabase(dbPath);
        runMigrations(fileDb, migrationsDir);
        const reopenedService = new SettingsService(new SettingsStore(fileDb));

        const retrieved = reopenedService.getSettings(sampleSettingsInput.guildId);
        assert.ok(retrieved);
        assert.equal(retrieved.cityName, 'Cairo');
        assert.equal(retrieved.countryName, 'Egypt');
        assert.equal(retrieved.timezone, 'Africa/Cairo');
        assert.equal(retrieved.calculationMethod, 'Egyptian');
        assert.equal(retrieved.voiceLeadTimeMinutes, 10);
      } finally {
        if (fileDb.open) {
          fileDb.close();
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should update partial settings atomically', () => {
      service.saveSettings(sampleSettingsInput);

      const updated = service.updateSettings(sampleSettingsInput.guildId, {
        voiceLeadTimeMinutes: 15,
        calculationMethod: 'MuslimWorldLeague'
      });

      assert.equal(updated.voiceLeadTimeMinutes, 15);
      assert.equal(updated.calculationMethod, 'MuslimWorldLeague');
      assert.equal(updated.cityName, 'Cairo'); // Unmodified fields preserved

      const retrieved = service.getSettings(sampleSettingsInput.guildId);
      assert.equal(retrieved?.voiceLeadTimeMinutes, 15);
      assert.equal(retrieved?.calculationMethod, 'MuslimWorldLeague');
    });

    it('should toggle enabled state using setEnabled', () => {
      service.saveSettings(sampleSettingsInput);

      service.setEnabled(sampleSettingsInput.guildId, false);
      let retrieved = service.getSettings(sampleSettingsInput.guildId);
      assert.equal(retrieved?.enabled, false);

      service.setEnabled(sampleSettingsInput.guildId, true);
      retrieved = service.getSettings(sampleSettingsInput.guildId);
      assert.equal(retrieved?.enabled, true);
    });

    it('should reject invalid settings with Zod validation error', () => {
      assert.throws(
        () =>
          service.saveSettings({
            ...sampleSettingsInput,
            latitude: 150 // Invalid latitude > 90
          }),
        /Latitude must be <= 90/
      );

      assert.throws(
        () =>
          service.saveSettings({
            ...sampleSettingsInput,
            timezone: 'Invalid/Non_Existent_Timezone'
          }),
        /Invalid IANA timezone identifier/
      );

      assert.throws(
        () =>
          service.saveSettings({
            ...sampleSettingsInput,
            mentionType: 'role',
            mentionRoleId: null // mentionRoleId required if mentionType is role
          }),
        /mentionRoleId is required when mentionType is/
      );
    });
  });
});
