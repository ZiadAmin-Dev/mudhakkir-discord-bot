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
import { createLogger, Logger } from '../infrastructure/logging/logger.js';
import { createDatabase, runMigrations } from '../infrastructure/persistence/storage.js';
import { createDiscordClient } from '../discord/client.js';
import { SettingsStore } from '../infrastructure/persistence/settings-store.js';
import { SettingsService } from '../modules/settings/settings.service.js';

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

  // 5. Stores & Services (Singletons)
  di.registerSingleton(TOKENS.SettingsStore, SettingsStore);
  di.registerSingleton(TOKENS.SettingsService, SettingsService);

  return di;
}

export { container, TOKENS };
