import type { MiddlewareHandler } from "hono";
import { withLogContext } from "./context";
import type { Logger } from "./types";

export function httpAccess(logger: Logger): MiddlewareHandler {
  return async (c, next) => {
    const request_id = crypto.randomUUID();
    const started = performance.now();

    await withLogContext(
      {
        attributes: { request_id },
        spanName: `${c.req.method} ${c.req.path}`,
        spanOp: "http.server",
      },
      async () => {
        const reqLog = logger.child({
          name: "http",
          bindings: { request_id },
        });
        try {
          await next();
        } finally {
          const status = c.res.status;
          const fields = {
            method: c.req.method,
            path: c.req.path,
            status,
            durationMs: Math.round(performance.now() - started),
            request_id,
          };
          if (status >= 500) reqLog.error(fields, "http request");
          else if (status >= 400) reqLog.warn(fields, "http request");
          else reqLog.debug(fields, "http request");
        }
      },
    );
  };
}
