import { Client, GatewayIntentBits } from 'discord.js';
import { Logger } from '../infrastructure/logging/logger.js';

export function createDiscordClient(logger: Logger): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates
    ]
  });

  client.on('error', (error) => {
    logger.error({ err: error }, 'Discord client encountered an error');
  });

  client.on('warn', (warning) => {
    logger.warn({ warning }, 'Discord client emitted a warning');
  });

  return client;
}
