/*
Shared logging contract.
Explain: This module defines the minimal structured-logging port that domain and
application code depend on. Infrastructure provides the concrete implementation
(e.g. pino) which must satisfy this interface.
*/

export type LogMethod = (obj: object | string, message?: string, ...args: unknown[]) => void;

export interface Logger {
  fatal: LogMethod;
  error: LogMethod;
  warn: LogMethod;
  info: LogMethod;
  debug: LogMethod;
  trace: LogMethod;
  /** Flush buffered output before process exit when the implementation supports it. */
  flush?: () => void;
}
