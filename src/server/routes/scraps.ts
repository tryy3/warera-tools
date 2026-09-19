import { Hono } from "hono";
import { getLatestItemMarketPrice } from "../../db/prices";
import type { Db } from "../../db/client";
import { runPricePoll } from "../../jobs/price-poll/run";
import type { Logger } from "../../logging/logger";
import { serializeMoney } from "../../money/decimal";
import type { WareraRequester } from "../../warera/prices";
import { HttpError } from "../errors";

export type ScrapPricePayload = { price: string; fetchedAt: string };
export type ScrapPriceResponse = ScrapPricePayload & { stale?: boolean };

export type ScrapsRouteDeps = {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
};

export async function resolveScrapPrice(
  db: Db,
  warera: WareraRequester,
  logger: Logger,
  options: { force: boolean },
): Promise<ScrapPriceResponse> {
  if (!options.force) {
    const hit = await getLatestItemMarketPrice(db, "scraps");
    if (hit) {
      return { price: serializeMoney(hit.price)!, fetchedAt: hit.fetchedAt.toISOString() };
    }
  }

  try {
    await runPricePoll({ db, warera, logger });
    const hit = await getLatestItemMarketPrice(db, "scraps");
    if (!hit) {
      throw new Error("Price poll completed but scraps price is missing");
    }
    return { price: serializeMoney(hit.price)!, fetchedAt: hit.fetchedAt.toISOString() };
  } catch (err) {
    const fallback = await getLatestItemMarketPrice(db, "scraps");
    if (fallback) {
      return {
        price: serializeMoney(fallback.price)!,
        fetchedAt: fallback.fetchedAt.toISOString(),
        stale: true,
      };
    }
    throw new HttpError(
      502,
      "upstream_error",
      err instanceof Error ? err.message : "Failed to fetch scrap price",
    );
  }
}

export function scrapsRoutes(deps: ScrapsRouteDeps) {
  const { db, warera, logger } = deps;
  const app = new Hono();

  app.get("/", async (c) => {
    const result = await resolveScrapPrice(db, warera, logger, { force: false });
    return c.json(result);
  });

  app.post("/refresh", async (c) => {
    const result = await resolveScrapPrice(db, warera, logger, { force: true });
    return c.json(result);
  });

  return app;
}
