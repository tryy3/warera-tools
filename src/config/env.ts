import "dotenv/config";

export type AppConfig = {
  nodeEnv: "development" | "production" | "test";
  host: string;
  port: number;
  tursoDatabaseUrl: string;
  tursoAuthToken: string | undefined;
  wareraApiBaseUrl: string;
  wareraApiKey: string | undefined;
  wareraMaxRequestsPerMinute: number;
  discordWebhookUrl: string | undefined;
  logLevel: string;
  logMaskSecrets: boolean;
  logFile: string | undefined;
  jobRunHistoryLimit: number;
};

function parseBoolEnv(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined || value === "") return defaultValue;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return defaultValue;
}

export function parseConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): AppConfig {
  const tursoDatabaseUrl = env.TURSO_DATABASE_URL;
  if (!tursoDatabaseUrl) {
    throw new Error("TURSO_DATABASE_URL is required");
  }
  const nodeEnv = (env.NODE_ENV ?? "development") as AppConfig["nodeEnv"];
  return {
    nodeEnv,
    host: env.HOST ?? "127.0.0.1",
    port: Number(env.PORT ?? 8787),
    tursoDatabaseUrl,
    tursoAuthToken: env.TURSO_AUTH_TOKEN,
    wareraApiBaseUrl: env.WARERA_API_BASE_URL ?? "https://gateway.warerastats.io/trpc",
    wareraApiKey: env.WARERA_API_KEY,
    wareraMaxRequestsPerMinute: Number(env.WARERA_MAX_REQUESTS_PER_MINUTE ?? 120),
    discordWebhookUrl: env.DISCORD_WEBHOOK_URL,
    logLevel: env.LOG_LEVEL ?? "info",
    logMaskSecrets: parseBoolEnv(
      env.LOG_MASK_SECRETS,
      nodeEnv === "production",
    ),
    logFile: env.LOG_FILE || undefined,
    jobRunHistoryLimit: Number(env.JOB_RUN_HISTORY_LIMIT ?? 50),
  };
}

export function loadConfig(): AppConfig {
  return parseConfig(process.env);
}
