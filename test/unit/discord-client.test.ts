import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDiscordClient } from '../../src/discord/client.js';
import { createLogger } from '../../src/infrastructure/logging/index.js';
import { GatewayIntentBits } from 'discord.js';

describe('Discord Client Initialization (Milestone 1)', () => {
  it('should initialize Discord client with Guilds and GuildVoiceStates intents', () => {
    const logger = createLogger('error', false);
    const client = createDiscordClient(logger);

    assert.ok(client);
    assert.ok(client.options.intents);
    
    const bitfield = client.options.intents.bitfield;
    const requiredIntents = GatewayIntentBits.Guilds | GatewayIntentBits.GuildVoiceStates;

    assert.equal((bitfield & requiredIntents), requiredIntents);
  });
});
