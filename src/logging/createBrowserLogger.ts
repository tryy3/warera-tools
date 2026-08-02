import { createLiteLogger } from "tslog/lite";
import type { Logger } from "./types";

type Lite = ReturnType<typeof createLiteLogger>;

function adaptLite(log: Lite): Logger {
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
    child: (opts) => adaptLite(log.getSubLogger({ name: opts?.name })),
  };
}

export function createBrowserLogger(): Logger {
  return adaptLite(
    createLiteLogger({
      name: "warera-web",
      minLevel: import.meta.env.DEV ? "DEBUG" : "WARN",
    }),
  );
}
