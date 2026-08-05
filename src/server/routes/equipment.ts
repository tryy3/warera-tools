import { Hono } from "hono";
import type { Db } from "../../db/client";
import { listItemMarketTxSince } from "../../db/item-market-tx-read";
import { getLatestItemMarketPrice } from "../../db/prices";
import { buildEquipmentOverview } from "../../equipment/overview";
import { MARKET_WINDOW_MS } from "../../equipment/windows";
import type { Logger } from "../../logging/logger";
import type { WareraRequester } from "../../warera/prices";

export type EquipmentRouteDeps = {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
};

export function equipmentRoutes(deps: EquipmentRouteDeps) {
  const { db } = deps;
  const app = new Hono();

  app.get("/overview", async (c) => {
    const now = Date.now();
    const since = new Date(now - MARKET_WINDOW_MS);
    const txs = await listItemMarketTxSince(db, since);
    const scrap = await getLatestItemMarketPrice(db, "scraps");
    const items = buildEquipmentOverview(txs, scrap?.price ?? null);
    return c.json({
      windowMs: MARKET_WINDOW_MS,
      scrapPrice: scrap?.price ?? null,
      scrapedAt: scrap?.fetchedAt?.toISOString() ?? null,
      items,
    });
  });

  return app;
}
