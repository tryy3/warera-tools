import { Hono } from "hono";
import type { Db } from "../../db/client";
import { listPlayerItemFills } from "../../db/item-market-tx-player";
import { buildMyTrades } from "../../market/buildMyTrades";
import { parsePriceHistoryRange } from "../../market/ranges";
import { HttpError } from "../errors";

export type MarketRouteDeps = {
  db: Db;
};

export function marketRoutes(deps: MarketRouteDeps) {
  const { db } = deps;
  const app = new Hono();

  app.get("/:itemCode/my-trades", async (c) => {
    const itemCode = c.req.param("itemCode")?.trim() ?? "";
    const playerId = c.req.query("playerId")?.trim() ?? "";
    if (!itemCode) throw new HttpError(400, "bad_request", "itemCode is required");
    if (!playerId) throw new HttpError(400, "bad_request", "playerId is required");
    const range = parsePriceHistoryRange(c.req.query("range"));
    const rows = await listPlayerItemFills(db, { playerId, itemCode });
    const result = buildMyTrades({ itemCode, playerId, range, rows });
    return c.json({
      ...result,
      chunks: result.chunks.map((ch) => ({
        ...ch,
        startAt: ch.startAt.toISOString(),
        endAt: ch.endAt.toISOString(),
      })),
    });
  });

  return app;
}
