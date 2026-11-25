import pino, { Logger as PinoLogger } from 'pino';
import { Logger } from '../../shared/logging/logger.port.js';

export function createLogger(logLevel: keyof Logger = 'info', isDevelopment: boolean = false): Logger {
  let logger: PinoLogger;

  if (isDevelopment) {
    logger = pino({
      level: logLevel,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      }
    });
  } else {
    logger = pino({
      level: logLevel,
      timestamp: pino.stdTimeFunctions.isoTime
    });
  }

  return logger as unknown as Logger;
}
