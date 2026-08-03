import { Hono } from "hono";
import type { Db } from "../../db/client";
import type { Logger } from "../../logging/logger";
import { buildUser } from "../../user/build";
import type { WareraRequester } from "../../warera/prices";
import { HttpError } from "../errors";

export type UserRouteDeps = {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
};

export function userRoutes(deps: UserRouteDeps) {
  const { db, warera, logger } = deps;
  const app = new Hono();

  app.get("/", async (c) => {
    const userId = (c.req.query("userId") ?? "").trim();
    if (!userId) throw new HttpError(400, "invalid_query", "userId is required");
    const refreshRaw = (c.req.query("refresh") ?? "").trim().toLowerCase();
    const refresh = refreshRaw === "1" || refreshRaw === "true";
    try {
      return c.json(await buildUser({ db, warera, logger, userId, refresh }));
    } catch (err) {
      throw new HttpError(
        502,
        "upstream_error",
        err instanceof Error ? err.message : "User load failed",
      );
    }
  });

  return app;
}
