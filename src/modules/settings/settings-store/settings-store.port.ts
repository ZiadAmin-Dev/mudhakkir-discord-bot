/*
Settings persistence port.
Explain: This module defines the ISettingsStore abstraction that the domain-level
SettingsService depends on. The SQLite-backed SettingsStore owned by this
module implements this port using the shared database infrastructure.
*/

import { GuildSettings } from '../settings.types.js';

export interface ISettingsStore {
  get(guildId: string): GuildSettings | null;
  list(): GuildSettings[];
  save(settings: GuildSettings): void;
  delete(guildId: string): boolean;
}
