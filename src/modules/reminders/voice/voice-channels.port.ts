/*
Voice delivery ports.
Explain: The reminders module owns these abstractions. Discord-facing adapters
implement them; the voice cycle stays free of discord.js types.
*/

import type { PrayerName } from '../../prayer-times/index.js';

export interface VoiceChannelSnapshot {
  id: string;
  guildId: string;
  name: string;
  isGuildVoice: boolean;
  canView: boolean;
  canConnect: boolean;
  canSpeak: boolean;
  humanCount: number;
  /** @everyone cannot view the channel; used with includePrivateVoice. */
  hiddenFromEveryone: boolean;
}

export interface IVoiceChannelDirectory {
  list(guildId: string): Promise<VoiceChannelSnapshot[]>;
  get(guildId: string, channelId: string): Promise<VoiceChannelSnapshot | null>;
}

export interface IVoiceTransport {
  /** Joins, plays the prayer's local audio to completion, and disconnects. */
  announce(input: { guildId: string; channelId: string; prayer: PrayerName }): Promise<void>;
}
