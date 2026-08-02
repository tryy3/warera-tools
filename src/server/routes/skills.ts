import { Hono } from "hono";
import type { Db } from "../../db/client";
import type { Logger } from "../../logging/logger";
import { buildSkillsBootstrap } from "../../skills/bootstrap";
import type { WareraRequester } from "../../warera/prices";
import { HttpError } from "../errors";

export type SkillsRouteDeps = {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
};

export function skillsRoutes(deps: SkillsRouteDeps) {
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
      const result = await buildSkillsBootstrap({ db, warera, logger, userId, refresh });
      return c.json(result);
    } catch (err) {
      throw new HttpError(
        502,
        "upstream_error",
        err instanceof Error ? err.message : "Skills bootstrap failed",
      );
    }
  });

  return app;
}
