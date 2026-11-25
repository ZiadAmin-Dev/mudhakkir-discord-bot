import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  AUDIO_DIRECTORY,
  PRAYER_AUDIO_FILES,
  getAudioPath,
  validateAudioAssets
} from '../../../src/infrastructure/audio/index.js';

describe('Local audio assets (Milestone 6)', () => {
  it('resolves and contains a readable asset for every prayer', () => {
    assert.equal(getAudioPath('fajr'), path.join(AUDIO_DIRECTORY, 'fajr.pcm'));

    for (const file of Object.values(PRAYER_AUDIO_FILES)) {
      const asset = path.join(AUDIO_DIRECTORY, file);
      assert.ok(fs.existsSync(asset), `${asset} is missing`);
      assert.ok(fs.statSync(asset).size > 0, `${asset} is empty`);
    }
  });

  it('validates assets without throwing when all files are present', () => {
    const warnings: string[] = [];
    validateAudioAssets({ warn: (message) => warnings.push(String(message)) } as never);
    assert.deepEqual(warnings, []);
  });
});
