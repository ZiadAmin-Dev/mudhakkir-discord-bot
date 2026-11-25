import { injectable, inject } from 'tsyringe';
import { TOKENS } from '../../shared/di/tokens.js';
import {
  GuildSettings,
  CreateGuildSettingsInput,
  UpdateGuildSettingsInput
} from './settings.types.js';
import { ISettingsStore } from './settings-store.port.js';
import { Logger } from '../../shared/logging/logger.js';
import { NotFoundError } from '../../shared/error/app-error.js';

export interface ISettingsService {
  getSettings(guildId: string): GuildSettings | null;
  saveSettings(input: CreateGuildSettingsInput): GuildSettings;
  updateSettings(guildId: string, input: UpdateGuildSettingsInput): GuildSettings;
  setEnabled(guildId: string, enabled: boolean): GuildSettings;
  deleteSettings(guildId: string): boolean;
}

@injectable()
export class SettingsService implements ISettingsService {
  constructor(
    @inject(TOKENS.SettingsStore) private readonly store: ISettingsStore,
    @inject(TOKENS.Logger) private readonly logger?: Logger
  ) {}

  getSettings(guildId: string): GuildSettings | null {
    return this.store.get(guildId);
  }

  saveSettings(input: CreateGuildSettingsInput): GuildSettings {
    const settings: GuildSettings = {
      ...input,
      updatedAt: new Date().toISOString()
    };

    this.store.save(settings);
    this.logger?.info({ guildId: settings.guildId }, 'Guild settings saved successfully');
    return settings;
  }

  updateSettings(guildId: string, input: UpdateGuildSettingsInput): GuildSettings {
    const existing = this.store.get(guildId);
    if (!existing) {
      throw new NotFoundError(`No existing configuration found for guild ${guildId}`);
    }

    const updated: GuildSettings = {
      ...existing,
      ...input,
      updatedAt: new Date().toISOString()
    };

    this.store.save(updated);
    this.logger?.info({ guildId }, 'Guild settings updated successfully');
    return updated;
  }

  setEnabled(guildId: string, enabled: boolean): GuildSettings {
    return this.updateSettings(guildId, { enabled });
  }

  deleteSettings(guildId: string): boolean {
    const deleted = this.store.delete(guildId);
    if (deleted) {
      this.logger?.info({ guildId }, 'Guild settings deleted');
    }
    return deleted;
  }
}
