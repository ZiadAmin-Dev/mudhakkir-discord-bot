export const TOKENS = {
  // Infrastructure & Core
  Config: Symbol.for('Config'),
  Logger: Symbol.for('Logger'),
  Database: Symbol.for('Database'),
  DiscordClient: Symbol.for('DiscordClient'),

  // Persistence Stores
  SettingsStore: Symbol.for('SettingsStore'),
  DeliveryLedgerStore: Symbol.for('DeliveryLedgerStore'),

  // Services
  SettingsService: Symbol.for('SettingsService'),
  LocationService: Symbol.for('LocationService'),
  PrayerTimesService: Symbol.for('PrayerTimesService'),
  SchedulerService: Symbol.for('SchedulerService'),
  TextAnnouncementService: Symbol.for('TextAnnouncementService'),
  VoiceAnnouncementService: Symbol.for('VoiceAnnouncementService'),
  VoiceCoordinator: Symbol.for('VoiceCoordinator')
} as const;
