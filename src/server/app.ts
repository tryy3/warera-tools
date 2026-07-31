import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppConfig } from "../config/env";
import type { Db } from "../db/client";
import type { SchedulerHandle } from "../jobs";
import type { Logger } from "../logging/logger";
import { errorPayload, HttpError } from "./errors";
import { authPlaceholder } from "./middleware/auth-placeholder";
import { healthRoutes } from "./routes/health";
import { jobsRoutes } from "./routes/jobs";

export type CreateAppDeps = {
  db: Db;
  logger: Logger;
  scheduler: SchedulerHandle;
  config: AppConfig;
};

export function createApp(deps: CreateAppDeps): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    if (!(err instanceof HttpError)) {
      deps.logger.error({ err }, "unhandled request error");
    }
    const { status, body } = errorPayload(err);
    return c.json(body, status as ContentfulStatusCode);
  });

  app.route("/api/health", healthRoutes());

  // Mount auth on /api/* except /api/health (BetterAuth later).
  app.use("/api/*", async (c, next) => {
    if (c.req.path === "/api/health") {
      return next();
    }
    return authPlaceholder(c, next);
  });
  app.route("/api/jobs", jobsRoutes(deps));

  return app;
}
