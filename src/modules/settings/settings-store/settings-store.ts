/*
SQLite adapter for guild settings.
Explain: The settings module owns this adapter. It implements the module's ISettingsStore
port using the shared SQLite connection created by infrastructure/persistence/storage.ts.
*/

import { injectable, inject } from 'tsyringe';
import { Database } from 'better-sqlite3';
import { z } from 'zod';
import { TOKENS } from '../../../shared/di/tokens.js';
import { GuildSettings } from '../settings.types.js';
import { ISettingsStore } from './settings-store.port.js';
import { validateGuildSettings } from '../settings.validation.js';

const GUILD_SETTINGS_COLUMNS = [
  'guild_id',
  'enabled',
  'city_name',
  'country_name',
  'latitude',
  'longitude',
  'timezone',
  'calculation_method',
  'text_channel_id',
  'mention_type',
  'mention_role_id',
  'voice_lead_time_minutes',
  'include_private_voice',
  'updated_at'
] as const;

const SELECT_GUILD_SETTINGS = `SELECT ${GUILD_SETTINGS_COLUMNS.join(', ')} FROM guild_settings WHERE guild_id = ?`;
const SELECT_ALL_GUILD_SETTINGS = `SELECT ${GUILD_SETTINGS_COLUMNS.join(', ')} FROM guild_settings`;

const GuildSettingsRowSchema = z.object({
  guild_id: z.string(),
  enabled: z.number(),
  city_name: z.string(),
  country_name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  calculation_method: z.string(),
  text_channel_id: z.string(),
  mention_type: z.string(),
  mention_role_id: z.string().nullable(),
  voice_lead_time_minutes: z.number(),
  include_private_voice: z.number(),
  updated_at: z.string()
});

type GuildSettingsRow = z.infer<typeof GuildSettingsRowSchema>;

function toEntity(row: GuildSettingsRow): GuildSettings {
  return validateGuildSettings({
    guildId: row.guild_id,
    enabled: Boolean(row.enabled),
    cityName: row.city_name,
    countryName: row.country_name,
    latitude: row.latitude,
    longitude: row.longitude,
    timezone: row.timezone,
    calculationMethod: row.calculation_method,
    textChannelId: row.text_channel_id,
    mentionType: row.mention_type,
    mentionRoleId: row.mention_role_id,
    voiceLeadTimeMinutes: row.voice_lead_time_minutes,
    includePrivateVoice: Boolean(row.include_private_voice),
    updatedAt: row.updated_at
  });
}

@injectable()
export class SettingsStore implements ISettingsStore {
  constructor(@inject(TOKENS.Database) private readonly db: Database) {}

  get(guildId: string): GuildSettings | null {
    const row = this.db.prepare(SELECT_GUILD_SETTINGS).get(guildId);

    if (row === undefined) {
      return null;
    }

    return toEntity(GuildSettingsRowSchema.parse(row));
  }

  list(): GuildSettings[] {
    const rows = this.db.prepare(SELECT_ALL_GUILD_SETTINGS).all();
    return rows.map((row) => toEntity(GuildSettingsRowSchema.parse(row)));
  }

  save(settings: GuildSettings): void {
    const validated = validateGuildSettings(settings);

    const stmt = this.db.prepare(`
      INSERT INTO guild_settings (
        guild_id, enabled, city_name, country_name, latitude, longitude,
        timezone, calculation_method, text_channel_id,
        mention_type, mention_role_id, voice_lead_time_minutes,
        include_private_voice, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(guild_id) DO UPDATE SET
        enabled = excluded.enabled,
        city_name = excluded.city_name,
        country_name = excluded.country_name,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        timezone = excluded.timezone,
        calculation_method = excluded.calculation_method,
        text_channel_id = excluded.text_channel_id,
        mention_type = excluded.mention_type,
        mention_role_id = excluded.mention_role_id,
        voice_lead_time_minutes = excluded.voice_lead_time_minutes,
        include_private_voice = excluded.include_private_voice,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      validated.guildId,
      validated.enabled ? 1 : 0,
      validated.cityName,
      validated.countryName,
      validated.latitude,
      validated.longitude,
      validated.timezone,
      validated.calculationMethod,
      validated.textChannelId,
      validated.mentionType,
      validated.mentionRoleId,
      validated.voiceLeadTimeMinutes,
      validated.includePrivateVoice ? 1 : 0,
      validated.updatedAt
    );
  }

  delete(guildId: string): boolean {
    const result = this.db.prepare('DELETE FROM guild_settings WHERE guild_id = ?').run(guildId);
    return result.changes > 0;
  }
}
