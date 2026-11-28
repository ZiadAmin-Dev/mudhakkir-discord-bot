import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Database } from 'better-sqlite3';
import { container, initContainer, TOKENS } from '../../src/app/composition.js';
import { AppConfig } from '../../src/app/config.js';

const baseConfig: AppConfig = {
  DISCORD_TOKEN: 'fake_token_for_di_test',
  CLIENT_ID: 'fake_client_id_123',
  LOG_LEVEL: 'fatal',
  NODE_ENV: 'test',
  SHUTDOWN_GRACE_MS: 10_000
};

describe('Configurable SQLite path (Milestone 8)', () => {
  it('opens the database at DB_PATH instead of the working-directory default', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mudhakkir-dbpath-'));
    const dbPath = path.join(tempDir, 'persistent', 'mudhakkir.db');
    const di = container.createChildContainer();

    try {
      initContainer({ ...baseConfig, DB_PATH: dbPath }, undefined, di);
      const db = di.resolve<Database>(TOKENS.Database);

      assert.ok(fs.existsSync(dbPath));
      assert.equal(db.name, dbPath);
      db.close();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
