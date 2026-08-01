import { Hono } from "hono";
import type { Db } from "../../db/client";
import { buildAdvisor } from "../../economy/advisor";
import type { Logger } from "../../logging/logger";
import type { WareraRequester } from "../../warera/prices";
import { searchUsers } from "../../warera/search";
import { HttpError } from "../errors";

export type EconomyRouteDeps = {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
};

export function economyRoutes(deps: EconomyRouteDeps) {
  const { db, warera, logger } = deps;
  const app = new Hono();

  app.get("/search", async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    if (q.length < 2) {
      throw new HttpError(400, "invalid_query", "q must be at least 2 characters");
    }
    try {
      const users = await searchUsers(warera, q);
      return c.json({ users });
    } catch (err) {
      throw new HttpError(
        502,
        "upstream_error",
        err instanceof Error ? err.message : "Search failed",
      );
    }
  });

  app.get("/advisor", async (c) => {
    const userId = (c.req.query("userId") ?? "").trim();
    if (!userId) {
      throw new HttpError(400, "invalid_query", "userId is required");
    }
    const refreshRaw = (c.req.query("refresh") ?? "").trim().toLowerCase();
    const refresh = refreshRaw === "1" || refreshRaw === "true";
    try {
      const result = await buildAdvisor({ db, warera, logger, userId, refresh });
      return c.json(result);
    } catch (err) {
      throw new HttpError(
        502,
        "upstream_error",
        err instanceof Error ? err.message : "Advisor failed",
      );
    }
  });

  return app;
}
