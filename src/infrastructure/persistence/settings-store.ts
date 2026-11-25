import { injectable, inject } from 'tsyringe';
import { Database } from 'better-sqlite3';
import { TOKENS } from '../../shared/di/tokens.js';
import { GuildSettings } from '../../modules/settings/settings.types.js';
import { ISettingsStore } from '../../modules/settings/settings-store.port.js';
import { validateGuildSettings } from '../../modules/settings/settings.validation.js';

interface GuildSettingsRow {
  guild_id: string;
  enabled: number;
  city_name: string;
  country_name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  calculation_method: string;
  text_channel_id: string;
  mention_type: string;
  mention_role_id: string | null;
  voice_lead_time_minutes: number;
  include_private_voice: number;
  updated_at: string;
}

@injectable()
export class SettingsStore implements ISettingsStore {
  constructor(@inject(TOKENS.Database) private readonly db: Database) {}

  get(guildId: string): GuildSettings | null {
    const row = this.db
      .prepare('SELECT * FROM guild_settings WHERE guild_id = ?')
      .get(guildId) as GuildSettingsRow | undefined;

    if (!row) {
      return null;
    }

    const settingsCandidate = {
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
    };

    return validateGuildSettings(settingsCandidate);
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
