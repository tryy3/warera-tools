import { Hono } from "hono";
import { getItemPriceHistory } from "../../db/price-history";
import { getLatestPrices, marketPriceMap } from "../../db/prices";
import type { Db } from "../../db/client";
import { runPricePoll } from "../../jobs/price-poll/run";
import type { Logger } from "../../logging/logger";
import { parsePriceHistoryRange } from "../../market/ranges";
import type { WareraRequester } from "../../warera/prices";
import { HttpError } from "../errors";

export type PricesRouteDeps = {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
};

export function pricesRoutes(deps: PricesRouteDeps) {
  const { db, warera, logger } = deps;
  const app = new Hono();

  app.get("/latest", async (c) => {
    let latest = await getLatestPrices(db);
    if (!latest) {
      try {
        await runPricePoll({ db, warera, logger });
        latest = await getLatestPrices(db);
      } catch (err) {
        throw new HttpError(
          502,
          "upstream_error",
          err instanceof Error ? err.message : "Failed to poll prices",
        );
      }
    }
    if (!latest) {
      throw new HttpError(404, "not_found", "No price data yet");
    }
    return c.json({
      pollId: latest.pollId,
      recordedAt: latest.recordedAt.toISOString(),
      status: latest.status,
      market: marketPriceMap(latest),
      items: latest.items,
    });
  });

  app.get("/history", async (c) => {
    const itemCodeRaw = c.req.query("itemCode");
    const itemCode = itemCodeRaw?.trim() ?? "";
    if (!itemCode) {
      throw new HttpError(400, "bad_request", "itemCode is required");
    }
    const range = parsePriceHistoryRange(c.req.query("range"));
    const history = await getItemPriceHistory(db, itemCode, range);
    if (!history) {
      throw new HttpError(404, "not_found", `No price history for ${itemCode}`);
    }
    const isoPoint = (p: NonNullable<typeof history.latest>) => ({
      recordedAt: p.recordedAt.toISOString(),
      marketPrice: p.marketPrice,
      topBuy: p.topBuy,
      topSell: p.topSell,
    });
    return c.json({
      itemCode: history.itemCode,
      range: history.range,
      latest: history.latest ? isoPoint(history.latest) : null,
      change24h: history.change24h,
      change7d: history.change7d,
      points: history.points.map(isoPoint),
    });
  });

  app.post("/poll", async (c) => {
    try {
      const result = await runPricePoll({ db, warera, logger });
      const latest = await getLatestPrices(db);
      return c.json({
        ...result,
        recordedAt: latest?.recordedAt.toISOString() ?? null,
        market: latest ? marketPriceMap(latest) : {},
        items: latest?.items ?? [],
      });
    } catch (err) {
      throw new HttpError(
        502,
        "upstream_error",
        err instanceof Error ? err.message : "Failed to poll prices",
      );
    }
  });

  return app;
}
