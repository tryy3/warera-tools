import { Logger as TsLogger } from "tslog";
import { fileTransport } from "tslog/transports/file";
import type { AppConfig } from "../config/env";
import { MASK_KEYS, resolveMaskEnabled } from "./mask";
import type { Logger } from "./types";

function toMinLevel(level: string): string {
  return level.trim().toUpperCase();
}

function adapt(log: TsLogger<unknown>): Logger {
  return {
    silly: (...args) => {
      log.silly(...args);
    },
    trace: (...args) => {
      log.trace(...args);
    },
    debug: (...args) => {
      log.debug(...args);
    },
    info: (...args) => {
      log.info(...args);
    },
    warn: (...args) => {
      log.warn(...args);
    },
    error: (...args) => {
      log.error(...args);
    },
    fatal: (...args) => {
      log.fatal(...args);
    },
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
    log.attachTransport(
      fileTransport({ path: config.logFile, format: "json", append: true }),
    );
  }

  return adapt(log);
}
