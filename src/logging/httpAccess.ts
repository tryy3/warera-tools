import type { MiddlewareHandler } from "hono";
import type { Logger } from "./types";

export function httpAccess(logger: Logger): MiddlewareHandler {
  return async (c, next) => {
    const requestId = crypto.randomUUID();
    const started = performance.now();
    const reqLog = logger.child({
      name: "http",
      bindings: { requestId },
    });

    await next();

    const status = c.res.status;
    const fields = {
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs: Math.round(performance.now() - started),
      requestId,
    };

    if (status >= 500) {
      reqLog.error(fields, "http request");
    } else if (status >= 400) {
      reqLog.warn(fields, "http request");
    } else {
      reqLog.debug(fields, "http request");
    }
  };
}
