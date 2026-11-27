/*
Process lifecycle and shutdown.
Explain: One idempotent teardown path for signals and fatal process events.
It stops new work, drains in-flight deliveries, closes Discord and SQLite,
flushes logs, then exits. Exit is injectable so tests never kill the runner.
*/

import { Client } from 'discord.js';
import type { Database as DatabaseType } from 'better-sqlite3';
import { Logger } from '../shared/logging/logger.port.js';
import { TaskTracker } from '../shared/lifecycle/task-tracker.js';
import { closeDatabase } from '../infrastructure/persistence/storage.js';
import { ISchedulingService } from '../modules/scheduling/index.js';

export interface ShutdownDependencies {
  client: Client;
  logger: Logger;
  scheduler?: ISchedulingService;
  tracker?: TaskTracker;
  database?: DatabaseType;
  graceMs?: number;
  exit?: (code: number) => void;
}

export async function runShutdown(
  dependencies: ShutdownDependencies,
  reason: string,
  exitCode: number
): Promise<void> {
  const { client, logger, scheduler, tracker, database } = dependencies;
  const exit = dependencies.exit ?? ((code: number) => process.exit(code));

  logger.info({ reason }, 'Shutdown started');
  scheduler?.stop();

  try {
    if (tracker && tracker.pending > 0) {
      const drained = await tracker.drain(dependencies.graceMs ?? 10_000);
      if (!drained) {
        logger.warn({ reason, pending: tracker.pending }, 'Grace period expired with tasks still in flight');
      }
    }

    if (client.isReady()) {
      await client.destroy();
      logger.info('Discord client connection closed cleanly');
    }
    if (database?.open) {
      closeDatabase(database);
      logger.info('Database closed cleanly');
    }
  } catch (error) {
    logger.error({ reason, err: error }, 'Error during shutdown');
    exitCode = 1;
  }

  logger.flush?.();
  logger.info({ reason, exitCode }, 'Graceful shutdown completed');
  exit(exitCode);
}

export function setupGracefulShutdown(dependencies: ShutdownDependencies): void {
  const { logger } = dependencies;
  let shuttingDown = false;
  const exit = dependencies.exit ?? ((code: number) => process.exit(code));

  const begin = (reason: string, code: number): void => {
    if (shuttingDown) {
      logger.warn({ reason }, 'Forced shutdown initiated');
      exit(1);
      return;
    }
    shuttingDown = true;
    void runShutdown(dependencies, reason, code);
  };

  process.on('SIGINT', () => begin('SIGINT', 0));
  process.on('SIGTERM', () => begin('SIGTERM', 0));
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled Promise Rejection detected');
    begin('unhandledRejection', 1);
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught Exception detected');
    begin('uncaughtException', 1);
  });
}
