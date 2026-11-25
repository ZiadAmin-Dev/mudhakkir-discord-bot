import { Client, Events } from 'discord.js';
import { AppConfig } from './config.js';
import { Logger } from '../infrastructure/logging/logger.js';
import { setupGracefulShutdown } from './shutdown.js';

export interface BootstrapResult {
  client: Client;
  logger: Logger;
}

export async function bootstrap(config: AppConfig, logger: Logger, client: Client): Promise<BootstrapResult> {
  setupGracefulShutdown(client, logger);

  return new Promise((resolve, reject) => {
    client.once(Events.ClientReady, (readyClient) => {
      logger.info(
        {
          botTag: readyClient.user.tag,
          botId: readyClient.user.id,
          guildCount: readyClient.guilds.cache.size
        },
        'Mudhakkir connected to Discord Gateway successfully'
      );
      resolve({ client, logger });
    });

    client.login(config.DISCORD_TOKEN).catch((err) => {
      logger.error({ err }, 'Failed to login to Discord');
      reject(err);
    });
  });
}
