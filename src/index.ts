import 'dotenv/config';
import 'reflect-metadata';
import { loadConfig } from './app/config.js';
import { initContainer, TOKENS } from './app/composition.js';
import { Logger } from './shared/logging/logger.port.js';
import { Client } from 'discord.js';
import { bootstrap } from './app/bootstrap.js';
import { ISchedulingService } from './modules/scheduling/index.js';
import { Database } from 'better-sqlite3';
import { TaskTracker } from './shared/lifecycle/task-tracker.js';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }

  const di = initContainer(config);
  const logger = di.resolve<Logger>(TOKENS.Logger);
  const client = di.resolve<Client>(TOKENS.DiscordClient);
  const scheduler = di.resolve<ISchedulingService>(TOKENS.SchedulerService);
  const tracker = di.resolve<TaskTracker>(TOKENS.TaskTracker);
  const database = di.resolve<Database>(TOKENS.Database);

  logger.info({ nodeEnv: config.NODE_ENV, logLevel: config.LOG_LEVEL }, 'Initializing Mudhakkir with DI container...');

  try {
    await bootstrap(config, logger, client, scheduler, tracker, database);
  } catch (error) {
    logger.fatal({ err: error }, 'Fatal error during bot startup');
    process.exit(1);
  }
}

void main();
