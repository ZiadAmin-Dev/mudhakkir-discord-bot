/*
Audio resource creation.
Explain: Raw PCM is streamed straight into @discordjs/voice; no decoder process
is started, so playback works offline with no ffmpeg dependency.
*/

import { createReadStream } from 'node:fs';
import { createAudioResource, StreamType } from '@discordjs/voice';
import type { PrayerName } from '../../modules/prayer-times/index.js';
import { getAudioPath } from './audio-library.js';

export function createPrayerAudioResource(prayer: PrayerName) {
  return createAudioResource(createReadStream(getAudioPath(prayer)), { inputType: StreamType.Raw });
}
