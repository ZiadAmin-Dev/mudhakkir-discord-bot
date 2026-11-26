import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, EnvSchema } from '../../src/app/config.js';

describe('App Configuration (Milestone 1)', () => {
  it('should validate and parse valid environment variables', () => {
    const validEnv = {
      DISCORD_TOKEN: 'test_token_12345',
      CLIENT_ID: '987654321',
      LOG_LEVEL: 'debug',
      NODE_ENV: 'test'
    };

    const config = loadConfig(validEnv as unknown as NodeJS.ProcessEnv);

    assert.equal(config.DISCORD_TOKEN, 'test_token_12345');
    assert.equal(config.CLIENT_ID, '987654321');
    assert.equal(config.LOG_LEVEL, 'debug');
    assert.equal(config.NODE_ENV, 'test');
  });

  it('should apply defaults for LOG_LEVEL and NODE_ENV when omitted', () => {
    const minimalEnv = {
      DISCORD_TOKEN: 'token_abc',
      CLIENT_ID: 'client_xyz'
    };

    const config = loadConfig(minimalEnv as unknown as NodeJS.ProcessEnv);

    assert.equal(config.DISCORD_TOKEN, 'token_abc');
    assert.equal(config.CLIENT_ID, 'client_xyz');
    assert.equal(config.LOG_LEVEL, 'info');
    assert.equal(config.NODE_ENV, 'development');
  });

  it('should treat a blank DEV_GUILD_ID as unset and trim a real value', () => {
    const blank = loadConfig({
      DISCORD_TOKEN: 'token_abc',
      CLIENT_ID: 'client_xyz',
      DEV_GUILD_ID: ''
    } as unknown as NodeJS.ProcessEnv);
    assert.equal(blank.DEV_GUILD_ID, undefined);

    const set = loadConfig({
      DISCORD_TOKEN: 'token_abc',
      CLIENT_ID: 'client_xyz',
      DEV_GUILD_ID: '  123456789  '
    } as unknown as NodeJS.ProcessEnv);
    assert.equal(set.DEV_GUILD_ID, '123456789');
  });

  it('should throw an informative error when DISCORD_TOKEN is missing', () => {
    const invalidEnv = {
      CLIENT_ID: 'client_xyz'
    };

    assert.throws(
      () => loadConfig(invalidEnv as unknown as NodeJS.ProcessEnv),
      /Application configuration error:[\s\S]*DISCORD_TOKEN/
    );
  });

  it('should throw an informative error when CLIENT_ID is missing', () => {
    const invalidEnv = {
      DISCORD_TOKEN: 'token_abc'
    };

    assert.throws(
      () => loadConfig(invalidEnv as unknown as NodeJS.ProcessEnv),
      /Application configuration error:[\s\S]*CLIENT_ID/
    );
  });

  it('should reject invalid LOG_LEVEL value', () => {
    const invalidEnv = {
      DISCORD_TOKEN: 'token_abc',
      CLIENT_ID: 'client_xyz',
      LOG_LEVEL: 'verbose'
    };

    assert.throws(
      () => loadConfig(invalidEnv as unknown as NodeJS.ProcessEnv),
      /Application configuration error:[\s\S]*LOG_LEVEL/
    );
  });
});
