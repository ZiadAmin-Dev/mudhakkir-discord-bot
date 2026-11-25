/*
This File is for initializing the application's dependency injection container and registering all required services.
Explain: This file contains the logic for setting up the dependency injection container and registering all necessary services and dependencies.
*/ 

import 'reflect-metadata';
import { DependencyContainer, container } from 'tsyringe';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOKENS } from '../shared/di/tokens.js';
import { AppConfig } from './config.js';
import { createLogger } from '../infrastructure/logging/index.js';
import { Logger } from '../shared/logging/logger.port.js';
import { createDatabase, runMigrations } from '../infrastructure/persistence/storage.js';
import { createDiscordClient } from '../discord/client.js';
import { DiscordMessageSender } from '../discord/discord-messages.js';
import { SettingsService, SettingsStore } from '../modules/settings/index.js';
import { LocationService } from '../modules/location/index.js';
import { PrayerTimesService } from '../modules/prayer-times/index.js';
import { SystemClock, Clock } from '../shared/clock.js';
import {
  DeliveryLedger,
  DeliveryLedgerStore,
  DueEventCallback,
  SchedulingService
} from '../modules/scheduling/index.js';
import { IReminderHandler, ReminderHandler, TextAnnouncementService } from '../modules/reminders/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Composition Root: Initializes and registers all application dependencies
 * into the centralized IoC container.
 */
export function initContainer(
  config: AppConfig,
  customDbPath?: string,
  targetContainer?: DependencyContainer
): DependencyContainer {
  const di = targetContainer ?? container;

  // 1. Configuration
  di.registerInstance(TOKENS.Config, config);

  // 2. Logger
  const isDev = config.NODE_ENV === 'development';
  const logger = createLogger(config.LOG_LEVEL, isDev);
  di.registerInstance<Logger>(TOKENS.Logger, logger);

  // 3. Database & Migrations
  const dbPath = customDbPath ?? path.resolve(process.cwd(), 'data/mudhakkir.db');
  const db = createDatabase(dbPath, logger);
  const migrationsDir = path.resolve(__dirname, '../infrastructure/persistence/migrations');
  runMigrations(db, migrationsDir, logger);
  di.registerInstance(TOKENS.Database, db);

  // 4. Discord Client
  const client = createDiscordClient(logger);
  di.registerInstance(TOKENS.DiscordClient, client);

  // 5. Clock
  di.registerInstance<Clock>(TOKENS.Clock, new SystemClock());

  // 6. Stores & Services (Singletons)
  di.registerSingleton(TOKENS.SettingsStore, SettingsStore);
  di.registerSingleton(TOKENS.SettingsService, SettingsService);
  di.registerSingleton(TOKENS.DeliveryLedgerStore, DeliveryLedgerStore);
  di.registerSingleton(TOKENS.DeliveryLedger, DeliveryLedger);

  // 7. Location & Prayer Times
  di.registerSingleton(TOKENS.LocationService, LocationService);
  di.registerSingleton(TOKENS.PrayerTimesService, PrayerTimesService);

  // 8. Reminder handler and text delivery.
  di.registerSingleton(TOKENS.TextMessageSender, DiscordMessageSender);
  di.registerSingleton(TOKENS.TextAnnouncementService, TextAnnouncementService);
  di.registerSingleton(TOKENS.ReminderHandler, ReminderHandler);

  // 9. Scheduling. The scheduler receives the reminder handler as its due-event callback.
  const reminderHandler = di.resolve<IReminderHandler>(TOKENS.ReminderHandler);
  const dueEventCallback: DueEventCallback = (event) => reminderHandler.handle(event);
  di.registerInstance<DueEventCallback>(TOKENS.DueEventCallback, dueEventCallback);
  di.registerSingleton(TOKENS.SchedulerService, SchedulingService);

  return di;
}

export { container, TOKENS };
