/*
This File is for loading and validating the application configuration. 
Explain: This file defines the schema for the application's configuration variables and provides a function to load and validate them.
*/ 

import { z } from 'zod';

export const EnvSchema = z.object({
  DISCORD_TOKEN: z
    .string()
    .min(1, 'DISCORD_TOKEN cannot be empty'),
  CLIENT_ID: z
    .string()
    .min(1, 'CLIENT_ID cannot be empty'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  // dotenv parses blank optional values as empty strings; treat those as "unset".
  DEV_GUILD_ID: z
    .string()
    .optional()
    .transform((value) => (value?.trim() ? value.trim() : undefined)),
  DB_PATH: z
    .string()
    .optional()
    .transform((value) => (value?.trim() ? value.trim() : undefined)),
  SHUTDOWN_GRACE_MS: z.coerce.number().int().min(0).default(10_000)
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = EnvSchema.safeParse(env);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `  - [${issue.path.join('.')}]: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Application configuration error:\n${errorDetails}\nPlease check your .env file or environment variables.`
    );
  }

  return result.data;
}