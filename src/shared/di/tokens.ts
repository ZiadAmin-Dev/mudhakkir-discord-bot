export const TOKENS = {
  // Infrastructure & Core
  Config: Symbol.for('Config'),
  Logger: Symbol.for('Logger'),
  Database: Symbol.for('Database'),
  DiscordClient: Symbol.for('DiscordClient'),
  Clock: Symbol.for('Clock'),

  // Persistence Stores
  SettingsStore: Symbol.for('SettingsStore'),
  DeliveryLedgerStore: Symbol.for('DeliveryLedgerStore'),

  // Location & Geocoding
  LocationService: Symbol.for('LocationService'),
  Geocoder: Symbol.for('Geocoder'),
  TimezoneResolver: Symbol.for('TimezoneResolver'),

  // Services
  SettingsService: Symbol.for('SettingsService'),
  SettingsChangeCallback: Symbol.for('SettingsChangeCallback'),
  PrayerTimesService: Symbol.for('PrayerTimesService'),
  DeliveryLedger: Symbol.for('DeliveryLedger'),
  SchedulerService: Symbol.for('SchedulerService'),
  DueEventCallback: Symbol.for('DueEventCallback'),
  TextMessageSender: Symbol.for('TextMessageSender'),
  TextAnnouncementService: Symbol.for('TextAnnouncementService'),
  ReminderHandler: Symbol.for('ReminderHandler'),
  VoiceAnnouncementService: Symbol.for('VoiceAnnouncementService'),
  VoiceCoordinator: Symbol.for('VoiceCoordinator'),
  VoiceChannelDirectory: Symbol.for('VoiceChannelDirectory'),
  VoiceTransport: Symbol.for('VoiceTransport'),

  // Discord presentation
  CommandHandlers: Symbol.for('CommandHandlers'),
  CommandRouter: Symbol.for('CommandRouter'),
  Authorization: Symbol.for('Authorization')
} as const;
