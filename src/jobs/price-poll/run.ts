import {
  getLatestPrices,
  insertPricePoll,
  insertPriceSnapshots,
  type PriceSnapshotRow,
} from "../../db/prices";
import type { Db } from "../../db/client";
import type { Logger } from "../../logging/logger";
import { fetchItemPrices, type WareraRequester } from "../../warera/prices";
import { fetchTopOrderAggregates } from "../../warera/top-orders";

export type RunPricePollResult = {
  pollId: number;
  itemCount: number;
  status: "success" | "partial";
  orderErrors: number;
};

export async function runPricePoll(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
  orderLimit?: number;
}): Promise<RunPricePollResult> {
  const { db, warera, logger } = options;
  const orderLimit = options.orderLimit ?? 10;
  const recordedAt = new Date();

  const market = await fetchItemPrices(warera);
  const itemCodes = Object.keys(market).toSorted();
  const rows: PriceSnapshotRow[] = [];
  let orderErrors = 0;

  for (const itemCode of itemCodes) {
    let buy = {
      min: null as number | null,
      max: null as number | null,
      avg: null as number | null,
    };
    let sell = {
      min: null as number | null,
      max: null as number | null,
      avg: null as number | null,
    };
    try {
      const orders = await fetchTopOrderAggregates(warera, itemCode, orderLimit);
      buy = orders.buy;
      sell = orders.sell;
    } catch (err) {
      orderErrors += 1;
      logger.warn(
        { itemCode, err: err instanceof Error ? err.message : String(err) },
        "top orders fetch failed",
      );
    }
    rows.push({
      itemCode,
      marketPrice: market[itemCode] ?? null,
      buyMin: buy.min,
      buyMax: buy.max,
      buyAvg: buy.avg,
      sellMin: sell.min,
      sellMax: sell.max,
      sellAvg: sell.avg,
    });
  }

  const status = orderErrors === 0 ? "success" : "partial";
  const pollId = await insertPricePoll(db, {
    recordedAt,
    status,
    error: orderErrors > 0 ? `${orderErrors} top-order fetch(es) failed` : null,
    itemCount: rows.length,
  });
  await insertPriceSnapshots(db, pollId, rows);

  logger.info({ pollId, itemCount: rows.length, status, orderErrors }, "price poll complete");
  return { pollId, itemCount: rows.length, status, orderErrors };
}

/** Ensure we have at least one successful/partial poll; otherwise run one. */
export async function ensureLatestPrices(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
}): Promise<Awaited<ReturnType<typeof getLatestPrices>>> {
  const existing = await getLatestPrices(options.db);
  if (existing) return existing;
  await runPricePoll(options);
  return getLatestPrices(options.db);
}
