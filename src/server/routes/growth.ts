import { Hono } from "hono";
import type { Db } from "../../db/client";
import { buildGrowthBootstrap } from "../../growth/bootstrap";
import type { Logger } from "../../logging/logger";
import type { WareraRequester } from "../../warera/prices";
import { HttpError } from "../errors";

export type GrowthRouteDeps = {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
};

export function growthRoutes(deps: GrowthRouteDeps) {
  const { db, warera, logger } = deps;
  const app = new Hono();

  app.get("/bootstrap", async (c) => {
    const userId = (c.req.query("userId") ?? "").trim();
    if (!userId) {
      throw new HttpError(400, "invalid_query", "userId is required");
    }
    const refreshRaw = (c.req.query("refresh") ?? "").trim().toLowerCase();
    const refresh = refreshRaw === "1" || refreshRaw === "true";
    try {
      const result = await buildGrowthBootstrap({ db, warera, logger, userId, refresh });
      return c.json(result);
    } catch (err) {
      throw new HttpError(
        502,
        "upstream_error",
        err instanceof Error ? err.message : "Growth bootstrap failed",
      );
    }
  });

  return app;
}
