import { Hono } from "hono";
import type { Db } from "../../db/client";
import type { Logger } from "../../logging/logger";
import { buildPlayerBattles } from "../../player-battles/build";
import type { WareraRequester } from "../../warera/prices";
import { HttpError } from "../errors";

export type PlayerBattlesRouteDeps = {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
};

export function playerBattlesRoutes(deps: PlayerBattlesRouteDeps) {
  const { db, warera, logger } = deps;
  const app = new Hono();

  app.get("/", async (c) => {
    const userId = (c.req.query("userId") ?? "").trim();
    if (!userId) throw new HttpError(400, "invalid_query", "userId is required");
    const refreshRaw = (c.req.query("refresh") ?? "").trim().toLowerCase();
    const refresh = refreshRaw === "1" || refreshRaw === "true";
    try {
      return c.json(await buildPlayerBattles({ db, warera, logger, userId, refresh }));
    } catch (err) {
      logger.error(
        { user_id: userId, error_message: err instanceof Error ? err.message : String(err) },
        "player battles failed",
      );
      throw new HttpError(
        502,
        "upstream_error",
        err instanceof Error ? err.message : "Player battles load failed",
      );
    }
  });

  return app;
}
