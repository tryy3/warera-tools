import { createLiteLogger } from "tslog/lite";
import type { LogFn, Logger } from "./types";

type Lite = ReturnType<typeof createLiteLogger>;

function adaptLite(log: Lite): Logger {
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
    child: (opts) => adaptLite(log.getSubLogger({ name: opts?.name })),
  };
}

export function createBrowserLogger(minLevel: "DEBUG" | "WARN" = "WARN"): Logger {
  return adaptLite(
    createLiteLogger({
      name: "warera-web",
      minLevel,
    }),
  );
}
