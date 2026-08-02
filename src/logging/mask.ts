import type { AppConfig } from "../config/env";

export const MASK_KEYS = [
  "authorization",
  "apiKey",
  "token",
  "password",
  "cookie",
  "WARERA_API_KEY",
  "TURSO_AUTH_TOKEN",
  "DISCORD_WEBHOOK_URL",
] as const;

export function resolveMaskEnabled(
  config: Pick<AppConfig, "logMaskSecrets">,
): boolean {
  return config.logMaskSecrets;
}
