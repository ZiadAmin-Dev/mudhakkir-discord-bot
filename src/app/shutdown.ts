import { Client } from 'discord.js';
import { Logger } from '../infrastructure/logging/logger.js';

export function setupGracefulShutdown(client: Client, logger: Logger): void {
  let isShuttingDown = false;

  const handleSignal = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn({ signal }, 'Forced shutdown initiated');
      process.exit(1);
    }

    isShuttingDown = true;
    logger.info({ signal }, 'Shutdown signal received. Starting graceful teardown...');

    try {
      if (client.isReady()) {
        logger.info('Destroying Discord client connection...');
        await client.destroy();
        logger.info('Discord client connection closed cleanly.');
      }
      logger.info('Graceful shutdown completed.');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => {
    void handleSignal('SIGINT');
  });

  process.on('SIGTERM', () => {
    void handleSignal('SIGTERM');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled Promise Rejection detected');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught Exception detected');
    process.exit(1);
  });
}
