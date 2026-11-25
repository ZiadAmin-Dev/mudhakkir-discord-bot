-- 001_initial_schema.sql
-- Initial database schema for Mudhakkir (MVP)

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  city_name TEXT NOT NULL,
  country_name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  timezone TEXT NOT NULL,
  calculation_method TEXT NOT NULL DEFAULT 'Egyptian',
  text_channel_id TEXT NOT NULL,
  mention_type TEXT NOT NULL DEFAULT 'everyone',
  mention_role_id TEXT,
  voice_lead_time_minutes INTEGER NOT NULL DEFAULT 10,
  include_private_voice INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_ledger (
  event_key TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  prayer_date TEXT NOT NULL,
  prayer_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  delivered_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_delivery_ledger_guild_date 
ON delivery_ledger (guild_id, prayer_date);
