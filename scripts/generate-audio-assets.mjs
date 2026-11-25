/*
Generates short placeholder prayer announcements as raw 48kHz stereo s16le PCM.
@discordjs/voice plays these directly with StreamType.RawS16le, so no ffmpeg or
Opus transcoding step is needed. Replace the generated files with real recitations
when available; keep the filenames and format the same.
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(projectRoot, 'assets', 'audio');
const SAMPLE_RATE = 48_000;
const DURATION_SECONDS = 1;
const SAMPLES = SAMPLE_RATE * DURATION_SECONDS;
const FREQUENCIES = {
  fajr: 440,
  dhuhr: 523.25,
  asr: 587.33,
  maghrib: 659.25,
  isha: 783.99
};

fs.mkdirSync(outputDir, { recursive: true });

for (const [prayer, frequency] of Object.entries(FREQUENCIES)) {
  const buffer = Buffer.alloc(SAMPLES * 2 * 2); // stereo 16-bit
  for (let i = 0; i < SAMPLES; i += 1) {
    const envelope = Math.min(1, i / (SAMPLE_RATE * 0.05)) * Math.min(1, (SAMPLES - i) / (SAMPLE_RATE * 0.15));
    const value = Math.round(Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE) * 8000 * envelope);
    buffer.writeInt16LE(value, i * 4);
    buffer.writeInt16LE(value, i * 4 + 2);
  }
  fs.writeFileSync(path.join(outputDir, `${prayer}.pcm`), buffer);
}

console.log(`Generated ${Object.keys(FREQUENCIES).length} audio assets in ${outputDir}`);
