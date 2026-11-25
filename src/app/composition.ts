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
import { DiscordVoiceDirectory } from '../discord/discord-channels.js';
import { DiscordVoiceTransport } from '../discord/voice-transport.js';
import { CommandAuthorization } from '../discord/authorization.js';
import { CommandRouter, registerInteractionHandler } from '../discord/command-router.js';
import type { ICommandHandler } from '../discord/commands/command-handler.js';
import { SetupCommand } from '../discord/commands/setup.js';
import { SettingsCommand } from '../discord/commands/settings.js';
import { PrayerTimesCommand } from '../discord/commands/prayer-times.js';
import { TestCommand } from '../discord/commands/test.js';
import { EnableCommand } from '../discord/commands/enable.js';
import { DisableCommand } from '../discord/commands/disable.js';
import { SettingsFlow } from '../discord/flows/settings-flow.js';
import { SetupFlow } from '../discord/flows/setup-flow.js';
import { validateAudioAssets } from '../infrastructure/audio/index.js';
import {
  ISettingsService,
  SettingsChangeCallback,
  SettingsService,
  SettingsStore
} from '../modules/settings/index.js';
import { ILocationService, LocationService } from '../modules/location/index.js';
import { IPrayerTimesService, PrayerTimesService } from '../modules/prayer-times/index.js';
import { SystemClock, Clock } from '../shared/clock.js';
import {
  DeliveryLedger,
  DeliveryLedgerStore,
  DueEventCallback,
  ISchedulingService,
  SchedulingService
} from '../modules/scheduling/index.js';
import {
  IReminderHandler,
  ITextAnnouncementService,
  IVoiceAnnouncementService,
  ReminderHandler,
  TextAnnouncementService,
  VoiceAnnouncementService,
  VoiceCoordinator
} from '../modules/reminders/index.js';

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

  // Settings writes rebuild the affected guild's schedule. Resolved lazily so
  // registration order does not matter.
  di.registerInstance<SettingsChangeCallback>(TOKENS.SettingsChangeCallback, (guildId) => {
    di.resolve<ISchedulingService>(TOKENS.SchedulerService).rebuild(guildId);
  });

  // 3. Local audio assets (warn only; announcements degrade gracefully)
  validateAudioAssets(logger);

  // 4. Database & Migrations
  const dbPath = customDbPath ?? path.resolve(process.cwd(), 'data/mudhakkir.db');
  const db = createDatabase(dbPath, logger);
  const migrationsDir = path.resolve(__dirname, '../infrastructure/persistence/migrations');
  runMigrations(db, migrationsDir, logger);
  di.registerInstance(TOKENS.Database, db);

  // 5. Discord Client
  const client = createDiscordClient(logger);
  di.registerInstance(TOKENS.DiscordClient, client);

  // 6. Clock
  di.registerInstance<Clock>(TOKENS.Clock, new SystemClock());

  // 7. Stores & Services (Singletons)
  di.registerSingleton(TOKENS.SettingsStore, SettingsStore);
  di.registerSingleton(TOKENS.SettingsService, SettingsService);
  di.registerSingleton(TOKENS.DeliveryLedgerStore, DeliveryLedgerStore);
  di.registerSingleton(TOKENS.DeliveryLedger, DeliveryLedger);

  // 8. Location & Prayer Times
  di.registerSingleton(TOKENS.LocationService, LocationService);
  di.registerSingleton(TOKENS.PrayerTimesService, PrayerTimesService);

  // 9. Text and voice delivery.
  di.registerSingleton(TOKENS.TextMessageSender, DiscordMessageSender);
  di.registerSingleton(TOKENS.TextAnnouncementService, TextAnnouncementService);
  di.registerSingleton(TOKENS.VoiceChannelDirectory, DiscordVoiceDirectory);
  di.registerSingleton(TOKENS.VoiceTransport, DiscordVoiceTransport);
  di.registerSingleton(TOKENS.VoiceCoordinator, VoiceCoordinator);
  di.registerSingleton(TOKENS.VoiceAnnouncementService, VoiceAnnouncementService);

  // 10. Reminder handler and scheduling. The scheduler uses the handler as its callback.
  di.registerSingleton(TOKENS.ReminderHandler, ReminderHandler);
  const reminderHandler = di.resolve<IReminderHandler>(TOKENS.ReminderHandler);
  const dueEventCallback: DueEventCallback = (event) => reminderHandler.handle(event);
  di.registerInstance<DueEventCallback>(TOKENS.DueEventCallback, dueEventCallback);
  di.registerSingleton(TOKENS.SchedulerService, SchedulingService);

  // 11. Discord presentation: authorization, command handlers, and the router.
  di.registerSingleton(TOKENS.Authorization, CommandAuthorization);
  const authorization = di.resolve<CommandAuthorization>(TOKENS.Authorization);
  const settingsService = di.resolve<ISettingsService>(TOKENS.SettingsService);
  const locationService = di.resolve<ILocationService>(TOKENS.LocationService);
  const prayerTimesService = di.resolve<IPrayerTimesService>(TOKENS.PrayerTimesService);
  const clock = di.resolve<Clock>(TOKENS.Clock);
  const textService = di.resolve<ITextAnnouncementService>(TOKENS.TextAnnouncementService);
  const voiceService = di.resolve<IVoiceAnnouncementService>(TOKENS.VoiceAnnouncementService);

  const handlers: ICommandHandler[] = [
    new SetupCommand(authorization, (interaction) => new SetupFlow(interaction, locationService, settingsService, logger)),
    new SettingsCommand(authorization, (interaction) => new SettingsFlow(interaction, settingsService, logger)),
    new PrayerTimesCommand(settingsService, prayerTimesService, clock, logger),
    new EnableCommand(authorization, settingsService),
    new DisableCommand(authorization, settingsService),
    new TestCommand(authorization, settingsService, textService, voiceService)
  ];
  di.registerInstance<ICommandHandler[]>(TOKENS.CommandHandlers, handlers);
  di.registerSingleton(TOKENS.CommandRouter, CommandRouter);
  registerInteractionHandler(client, di.resolve<CommandRouter>(TOKENS.CommandRouter));

  return di;
}

export { container, TOKENS };
