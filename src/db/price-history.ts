import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { calculatePriceChange, type PriceChange } from "../market/change";
import { rangeToMs, type PriceHistoryRange } from "../market/ranges";
import { moneyToNumber } from "../money/decimal";
import type { Db } from "./client";
import { pricePolls, priceSnapshots } from "./schema";

export type PriceHistoryPoint = {
  recordedAt: Date;
  marketPrice: number | null;
  topBuy: number | null;
  topSell: number | null;
};

export type ItemPriceHistory = {
  itemCode: string;
  range: PriceHistoryRange;
  latest: PriceHistoryPoint | null;
  change24h: PriceChange | null;
  change7d: PriceChange | null;
  points: PriceHistoryPoint[];
};

const OK_STATUSES = ["success", "partial"] as const;

function mapRow(row: {
  recordedAt: Date;
  marketPrice: Parameters<typeof moneyToNumber>[0];
  buyMax: Parameters<typeof moneyToNumber>[0];
  sellMin: Parameters<typeof moneyToNumber>[0];
}): PriceHistoryPoint {
  return {
    recordedAt: row.recordedAt,
    marketPrice: moneyToNumber(row.marketPrice),
    topBuy: moneyToNumber(row.buyMax),
    topSell: moneyToNumber(row.sellMin),
  };
}

async function latestBaselineAtOrBefore(
  db: Db,
  itemCode: string,
  atOrBefore: Date,
): Promise<number | null> {
  const rows = await db
    .select({ marketPrice: priceSnapshots.marketPrice })
    .from(priceSnapshots)
    .innerJoin(pricePolls, eq(priceSnapshots.pollId, pricePolls.id))
    .where(
      and(
        eq(priceSnapshots.itemCode, itemCode),
        inArray(pricePolls.status, [...OK_STATUSES]),
        lte(pricePolls.recordedAt, atOrBefore),
      ),
    )
    .orderBy(desc(pricePolls.recordedAt), desc(pricePolls.id))
    .limit(1);
  return moneyToNumber(rows[0]?.marketPrice);
}

export async function getItemPriceHistory(
  db: Db,
  itemCode: string,
  range: PriceHistoryRange,
  now: Date = new Date(),
): Promise<ItemPriceHistory | null> {
  const latestRows = await db
    .select({
      recordedAt: pricePolls.recordedAt,
      marketPrice: priceSnapshots.marketPrice,
      buyMax: priceSnapshots.buyMax,
      sellMin: priceSnapshots.sellMin,
    })
    .from(priceSnapshots)
    .innerJoin(pricePolls, eq(priceSnapshots.pollId, pricePolls.id))
    .where(and(eq(priceSnapshots.itemCode, itemCode), inArray(pricePolls.status, [...OK_STATUSES])))
    .orderBy(desc(pricePolls.recordedAt), desc(pricePolls.id))
    .limit(1);

  const latestRow = latestRows[0];
  if (!latestRow) return null;

  const since = new Date(now.getTime() - rangeToMs(range));
  const pointRows = await db
    .select({
      recordedAt: pricePolls.recordedAt,
      marketPrice: priceSnapshots.marketPrice,
      buyMax: priceSnapshots.buyMax,
      sellMin: priceSnapshots.sellMin,
    })
    .from(priceSnapshots)
    .innerJoin(pricePolls, eq(priceSnapshots.pollId, pricePolls.id))
    .where(
      and(
        eq(priceSnapshots.itemCode, itemCode),
        inArray(pricePolls.status, [...OK_STATUSES]),
        gte(pricePolls.recordedAt, since),
      ),
    )
    .orderBy(asc(pricePolls.recordedAt), asc(pricePolls.id));

  const latest = mapRow(latestRow as (typeof pointRows)[0]);
  const baseline24h = await latestBaselineAtOrBefore(
    db,
    itemCode,
    new Date(now.getTime() - rangeToMs("24h")),
  );
  const baseline7d = await latestBaselineAtOrBefore(
    db,
    itemCode,
    new Date(now.getTime() - rangeToMs("7d")),
  );

  return {
    itemCode,
    range,
    latest,
    change24h: calculatePriceChange(latest.marketPrice, baseline24h),
    change7d: calculatePriceChange(latest.marketPrice, baseline7d),
    points: pointRows.map((row) => mapRow(row)),
  };
}
