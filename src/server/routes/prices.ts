import { Hono } from "hono";
import { getLatestPrices, marketPriceMap } from "../../db/prices";
import type { Db } from "../../db/client";
import { runPricePoll } from "../../jobs/price-poll/run";
import type { Logger } from "../../logging/logger";
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
