/*
Settings persistence port.
Explain: This module defines the ISettingsStore abstraction that the domain-level
SettingsService depends on. Infrastructure adapters (e.g. the SQLite-backed
SettingsStore) implement this port.
*/

import { GuildSettings } from './settings.types.js';

export interface ISettingsStore {
  get(guildId: string): GuildSettings | null;
  save(settings: GuildSettings): void;
  delete(guildId: string): boolean;
}
