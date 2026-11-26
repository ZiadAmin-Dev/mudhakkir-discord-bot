/*
Local audio asset lookup.
Explain: Assets are project files, never fetched over the network. The files are
raw 48kHz stereo s16le PCM, playable by @discordjs/voice without ffmpeg.
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PrayerName } from '../../modules/prayer-times/index.js';
import type { Logger } from '../../shared/logging/logger.port.js';

// Works from both src/ (tsx) and dist/ (compiled): ../../.. is the project root.
export const AUDIO_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
  'assets',
  'audio'
);
export const PRAYER_AUDIO_FILES: Record<PrayerName, string> = {
  fajr: 'fajr.pcm',
  dhuhr: 'dhuhr.pcm',
  asr: 'asr.pcm',
  maghrib: 'maghrib.pcm',
  isha: 'isha.pcm'
};

export function getAudioPath(prayer: PrayerName): string {
  return path.join(AUDIO_DIRECTORY, PRAYER_AUDIO_FILES[prayer]);
}

export function validateAudioAssets(logger?: Logger): void {
  for (const [prayer, file] of Object.entries(PRAYER_AUDIO_FILES)) {
    const asset = path.join(AUDIO_DIRECTORY, file);
    if (!fs.existsSync(asset)) {
      logger?.warn({ prayer, asset }, 'Prayer audio asset is missing');
    }
  }
}
