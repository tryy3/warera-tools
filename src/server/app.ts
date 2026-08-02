import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppConfig } from "../config/env";
import type { Db } from "../db/client";
import type { SchedulerHandle } from "../jobs";
import { httpAccess } from "../logging/httpAccess";
import type { Logger } from "../logging/logger";
import { errorPayload, HttpError } from "./errors";
import { authPlaceholder } from "./middleware/auth-placeholder";
import { countriesRoutes } from "./routes/countries";
import { economyRoutes } from "./routes/economy";
import { growthRoutes } from "./routes/growth";
import { skillsRoutes } from "./routes/skills";
import { healthRoutes } from "./routes/health";
import { jobsRoutes } from "./routes/jobs";
import { pricesRoutes } from "./routes/prices";
import { scrapsRoutes } from "./routes/scraps";

export type CreateAppDeps = {
  db: Db;
  logger: Logger;
  scheduler: SchedulerHandle;
  config: AppConfig;
  warera: { request: <T>(path: string, init?: RequestInit) => Promise<T> };
};

export function createApp(deps: CreateAppDeps): Hono {
  const app = new Hono();

  app.use("/api/*", httpAccess(deps.logger));

  app.onError((err, c) => {
    if (!(err instanceof HttpError)) {
      deps.logger.error(err, "unhandled request error");
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
  app.route("/api/countries", countriesRoutes({ db: deps.db }));
  app.route("/api/scraps", scrapsRoutes({ db: deps.db, warera: deps.warera, logger: deps.logger }));
  app.route("/api/prices", pricesRoutes({ db: deps.db, warera: deps.warera, logger: deps.logger }));
  app.route(
    "/api/economy",
    economyRoutes({ db: deps.db, warera: deps.warera, logger: deps.logger }),
  );
  app.route("/api/growth", growthRoutes({ db: deps.db, warera: deps.warera, logger: deps.logger }));
  app.route("/api/skills", skillsRoutes({ db: deps.db, warera: deps.warera, logger: deps.logger }));

  // Production: serve built SPA from dist/web. Dev uses Vite on :5173.
  if (deps.config.nodeEnv === "production") {
    app.use("/*", serveStatic({ root: "./dist/web" }));
    app.get("/*", serveStatic({ root: "./dist/web", path: "index.html" }));
  }

  return app;
}
