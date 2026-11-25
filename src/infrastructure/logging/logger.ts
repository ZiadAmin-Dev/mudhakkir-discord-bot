import pino, { Logger as PinoLogger } from 'pino';
import { Logger } from '../../shared/logging/logger.js';

export type { Logger };

type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export function createLogger(logLevel: LogLevel = 'info', isDevelopment: boolean = false): Logger {
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
