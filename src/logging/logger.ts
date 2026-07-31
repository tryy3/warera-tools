import pino from "pino";
import type { AppConfig } from "../config/env";

export function createLogger(config: AppConfig) {
  return pino({
    level: config.logLevel,
    transport:
      config.nodeEnv === "development"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  });
}

export type Logger = ReturnType<typeof createLogger>;
