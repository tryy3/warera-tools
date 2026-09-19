import type { AppConfig } from "../config/env";

export const MASK_KEYS = [
  "authorization",
  "apiKey",
  "token",
  "password",
  "cookie",
  "WARERA_API_KEY",
  "DATABASE_URL",
  "databaseUrl",
  "connectionString",
  "DISCORD_WEBHOOK_URL",
  "SENTRY_DSN",
  "dsn",
] as const;

export function resolveMaskEnabled(config: Pick<AppConfig, "logMaskSecrets">): boolean {
  return config.logMaskSecrets;
}
