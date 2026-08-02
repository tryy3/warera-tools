import { Logger as TsLogger } from "tslog";
import { fileTransport } from "tslog/transports/file";
import type { AppConfig } from "../config/env";
import { MASK_KEYS, resolveMaskEnabled } from "./mask";
import type { LogFn, Logger } from "./types";

function toMinLevel(level: string): string {
  return level.trim().toUpperCase();
}

function adapt(log: TsLogger<unknown>): Logger {
  const level =
    (
      name: keyof Pick<Logger, "silly" | "trace" | "debug" | "info" | "warn" | "error" | "fatal">,
    ): LogFn =>
    (...args: unknown[]) => {
      (log[name] as LogFn)(...args);
    };

  return {
    silly: level("silly"),
    trace: level("trace"),
    debug: level("debug"),
    info: level("info"),
    warn: level("warn"),
    error: level("error"),
    fatal: level("fatal"),
    child: (opts) =>
      adapt(
        log.getSubLogger({
          name: opts?.name,
          bindings: opts?.bindings,
        }),
      ),
    flush: () => log.flush(),
  };
}

export function createServerLogger(config: AppConfig): Logger {
  const maskOn = resolveMaskEnabled(config);
  const log = new TsLogger({
    name: "warera",
    minLevel: toMinLevel(config.logLevel) as never,
    type: config.nodeEnv === "production" ? "json" : undefined,
    mask: maskOn
      ? { keys: [...MASK_KEYS], caseInsensitive: true, placeholder: "[***]" }
      : undefined,
  });

  if (config.logFile) {
    log.attachTransport(fileTransport({ path: config.logFile, format: "json", append: true }));
  }

  return adapt(log);
}
