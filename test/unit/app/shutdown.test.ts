import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Client } from 'discord.js';
import type { Database as DatabaseType } from 'better-sqlite3';
import { runShutdown } from '../../../src/app/shutdown.js';
import { Logger } from '../../../src/shared/logging/logger.port.js';
import { InMemoryTaskTracker } from '../../../src/shared/lifecycle/task-tracker.js';
import { ISchedulingService } from '../../../src/modules/scheduling/index.js';

function makeLogger(calls: string[]): Logger {
  return {
    fatal: () => {},
    error: () => {},
    warn: () => calls.push('warn'),
    info: () => {},
    debug: () => {},
    trace: () => {},
    flush: () => calls.push('flush')
  };
}

describe('Graceful shutdown (Milestone 8)', () => {
  it('stops work, drains tasks, closes resources, and exits with the requested code', async () => {
    const calls: string[] = [];
    const tracker = new InMemoryTaskTracker();
    tracker.track(Promise.resolve());

    const client = {
      isReady: () => true,
      destroy: async () => {
        calls.push('destroy');
      }
    } as unknown as Client;
    const scheduler = {
      stop: () => calls.push('stop')
    } as unknown as ISchedulingService;
    const database = {
      open: true,
      pragma: () => {},
      close: () => calls.push('close')
    } as unknown as DatabaseType;

    await runShutdown(
      {
        client,
        logger: makeLogger(calls),
        scheduler,
        tracker,
        database,
        graceMs: 100,
        exit: (code) => calls.push(`exit:${code}`)
      },
      'SIGINT',
      0
    );

    assert.deepEqual(calls, ['stop', 'destroy', 'close', 'flush', 'exit:0']);
  });

  it('warns and still exits if tasks outlive the grace period', async () => {
    const calls: string[] = [];
    const tracker = new InMemoryTaskTracker();
    tracker.track(new Promise<void>(() => {}));
    const client = { isReady: () => false, destroy: async () => {} } as unknown as Client;

    await runShutdown(
      {
        client,
        logger: makeLogger(calls),
        tracker,
        graceMs: 5,
        exit: (code) => calls.push(`exit:${code}`)
      },
      'unhandledRejection',
      1
    );

    assert.ok(calls.includes('warn'));
    assert.equal(calls.at(-1), 'exit:1');
  });
});
