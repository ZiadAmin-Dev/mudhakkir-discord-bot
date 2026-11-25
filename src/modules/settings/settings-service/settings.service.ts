import { injectable, inject } from 'tsyringe';
import { TOKENS } from '../../../shared/di/tokens.js';
import {
  GuildSettings,
  CreateGuildSettingsInput,
  UpdateGuildSettingsInput
} from '../settings.types.js';
import { ISettingsStore } from '../settings-store/index.js';
import { Logger } from '../../../shared/logging/logger.port.js';
import { settingsNotFoundError } from '../settings.errors.js';

export type SettingsChangeCallback = (guildId: string) => void;

export interface ISettingsService {
  getSettings(guildId: string): GuildSettings | null;
  listSettings(): GuildSettings[];
  saveSettings(input: CreateGuildSettingsInput): GuildSettings;
  updateSettings(guildId: string, input: UpdateGuildSettingsInput): GuildSettings;
  setEnabled(guildId: string, enabled: boolean): GuildSettings;
  deleteSettings(guildId: string): boolean;
}

@injectable()
export class SettingsService implements ISettingsService {
  constructor(
    @inject(TOKENS.SettingsStore) private readonly store: ISettingsStore,
    @inject(TOKENS.Logger) private readonly logger?: Logger,
    @inject(TOKENS.SettingsChangeCallback) private readonly onChange?: SettingsChangeCallback
  ) {}

  getSettings(guildId: string): GuildSettings | null {
    return this.store.get(guildId);
  }

  listSettings(): GuildSettings[] {
    return this.store.list();
  }

  saveSettings(input: CreateGuildSettingsInput): GuildSettings {
    const settings: GuildSettings = {
      ...input,
      updatedAt: new Date().toISOString()
    };

    this.store.save(settings);
    this.logger?.info({ guildId: settings.guildId }, 'Guild settings saved successfully');
    this.onChange?.(settings.guildId);
    return settings;
  }

  updateSettings(guildId: string, input: UpdateGuildSettingsInput): GuildSettings {
    const existing = this.store.get(guildId);
    if (!existing) {
      throw settingsNotFoundError;
    }

    const updated: GuildSettings = {
      ...existing,
      ...input,
      updatedAt: new Date().toISOString()
    };

    this.store.save(updated);
    this.logger?.info({ guildId }, 'Guild settings updated successfully');
    this.onChange?.(guildId);
    return updated;
  }

  setEnabled(guildId: string, enabled: boolean): GuildSettings {
    return this.updateSettings(guildId, { enabled });
  }

  deleteSettings(guildId: string): boolean {
    const deleted = this.store.delete(guildId);
    if (deleted) {
      this.logger?.info({ guildId }, 'Guild settings deleted');
      this.onChange?.(guildId);
    }
    return deleted;
  }
}
