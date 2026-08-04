import * as Sentry from "@sentry/node";
import type { Transport } from "tslog";
import type { AppConfig } from "../config/env";

const TO_SENTRY_LOG = {
  SILLY: "trace",
  TRACE: "trace",
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
  FATAL: "fatal",
} as const;

type SentryLogMethod = (typeof TO_SENTRY_LOG)[keyof typeof TO_SENTRY_LOG];
type LogLevelName = keyof typeof TO_SENTRY_LOG;

let initialized = false;

/** @internal test helper */
export function resetSentryStateForTests(): void {
  initialized = false;
}

export function initSentry(config: Pick<AppConfig, "sentryDsn" | "nodeEnv">): boolean {
  if (!config.sentryDsn) return false;
  if (initialized) return true;
  try {
    Sentry.init({
      dsn: config.sentryDsn,
      enableLogs: true,
      environment: config.nodeEnv,
    });
    initialized = true;
    return true;
  } catch (err) {
    console.error("Sentry.init failed; continuing without Sentry", err);
    initialized = false;
    return false;
  }
}

type AttachableLogger = {
  attachTransport: (transport: Transport<unknown>) => unknown;
};

function findNativeError(record: unknown): Error | undefined {
  const candidates = [record, ...Object.values((record ?? {}) as object)];
  for (const value of candidates) {
    const native = (value as { nativeError?: unknown } | null)?.nativeError;
    if (native instanceof Error) return native;
  }
  return undefined;
}

function messageText(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value == null) return fallback;
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

export function attachSentryTransports(
  log: AttachableLogger,
  config: Pick<AppConfig, "sentryDsn" | "logLevel">,
): void {
  if (!config.sentryDsn || !initialized) return;

  const minLevel = config.logLevel.trim().toUpperCase() as LogLevelName;

  log.attachTransport({
    name: "sentry",
    minLevel: "ERROR",
    format: "json",
    write(record, line) {
      const { _logMeta, ...fields } = JSON.parse(line) as {
        _logMeta?: { logLevelName?: string };
        message?: unknown;
      } & Record<string, unknown>;
      const level = _logMeta?.logLevelName === "FATAL" ? "fatal" : "error";
      const nativeError = findNativeError(record);
      if (nativeError) {
        Sentry.captureException(nativeError, { level, extra: fields });
      } else {
        Sentry.captureMessage(messageText(fields.message, line), { level, extra: fields });
      }
    },
  });

  log.attachTransport({
    name: "sentry-logs",
    minLevel,
    format: "json",
    write(_record, line) {
      const parsed = JSON.parse(line) as {
        _logMeta?: { logLevelName?: string };
        message?: unknown;
      } & Record<string, unknown>;
      const { _logMeta, message, ...attributes } = parsed;
      const levelName = (_logMeta?.logLevelName ?? "INFO") as LogLevelName;
      const method = (TO_SENTRY_LOG[levelName] ?? "info") as SentryLogMethod;
      Sentry.logger[method](messageText(message, ""), attributes);
    },
  });
}

export async function closeSentry(): Promise<void> {
  if (!initialized) return;
  await Sentry.close();
  initialized = false;
}
