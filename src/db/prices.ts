import { desc, eq, sql } from "drizzle-orm";
import { isFiniteMoney, parseMoney, type Decimal } from "../money/decimal";
import type { Db } from "./client";
import { pricePolls, priceSnapshots, type PricePollStatus } from "./schema";

export type PriceSnapshotRow = {
  itemCode: string;
  marketPrice: Decimal | null;
  buyMin: Decimal | null;
  buyMax: Decimal | null;
  buyAvg: Decimal | null;
  sellMin: Decimal | null;
  sellMax: Decimal | null;
  sellAvg: Decimal | null;
};

export type LatestPrices = {
  pollId: number;
  recordedAt: Date;
  status: string;
  items: PriceSnapshotRow[];
};

/** Coerce WarEra/API numbers into Decimal rows for insert. */
export function toPriceSnapshotRow(row: {
  itemCode: string;
  marketPrice: Decimal | number | string | null;
  buyMin: Decimal | number | string | null;
  buyMax: Decimal | number | string | null;
  buyAvg: Decimal | number | string | null;
  sellMin: Decimal | number | string | null;
  sellMax: Decimal | number | string | null;
  sellAvg: Decimal | number | string | null;
}): PriceSnapshotRow {
  return {
    itemCode: row.itemCode,
    marketPrice: parseMoney(row.marketPrice),
    buyMin: parseMoney(row.buyMin),
    buyMax: parseMoney(row.buyMax),
    buyAvg: parseMoney(row.buyAvg),
    sellMin: parseMoney(row.sellMin),
    sellMax: parseMoney(row.sellMax),
    sellAvg: parseMoney(row.sellAvg),
  };
}

export async function insertPricePoll(
  db: Db,
  values: {
    recordedAt: Date;
    status: PricePollStatus;
    error?: string | null;
    itemCount: number;
  },
): Promise<number> {
  const result = await db
    .insert(pricePolls)
    .values({
      recordedAt: values.recordedAt,
      status: values.status,
      error: values.error ?? null,
      itemCount: values.itemCount,
    })
    .returning({ id: pricePolls.id });
  const id = result[0]?.id;
  if (id == null) throw new Error("Failed to insert price_polls row");
  return id;
}

export async function insertPriceSnapshots(
  db: Db,
  pollId: number,
  rows: Array<Parameters<typeof toPriceSnapshotRow>[0]>,
): Promise<void> {
  if (rows.length === 0) return;
  const normalized = rows.map(toPriceSnapshotRow);
  await db.insert(priceSnapshots).values(
    normalized.map((row) => ({
      pollId,
      itemCode: row.itemCode,
      marketPrice: row.marketPrice,
      buyMin: row.buyMin,
      buyMax: row.buyMax,
      buyAvg: row.buyAvg,
      sellMin: row.sellMin,
      sellMax: row.sellMax,
      sellAvg: row.sellAvg,
    })),
  );
}

/**
 * Latest successful/partial poll + its snapshots in **one** round-trip
 * (subquery for poll id, then join snapshots).
 */
export async function getLatestPrices(db: Db): Promise<LatestPrices | null> {
  const latestPollId = sql`(
    select ${pricePolls.id}
    from ${pricePolls}
    where ${pricePolls.status} in ('success', 'partial')
    order by ${pricePolls.recordedAt} desc, ${pricePolls.id} desc
    limit 1
  )`;

  const rows = await db
    .select({
      pollId: pricePolls.id,
      recordedAt: pricePolls.recordedAt,
      status: pricePolls.status,
      itemCode: priceSnapshots.itemCode,
      marketPrice: priceSnapshots.marketPrice,
      buyMin: priceSnapshots.buyMin,
      buyMax: priceSnapshots.buyMax,
      buyAvg: priceSnapshots.buyAvg,
      sellMin: priceSnapshots.sellMin,
      sellMax: priceSnapshots.sellMax,
      sellAvg: priceSnapshots.sellAvg,
    })
    .from(pricePolls)
    .innerJoin(priceSnapshots, eq(priceSnapshots.pollId, pricePolls.id))
    .where(eq(pricePolls.id, latestPollId));

  const first = rows[0];
  if (!first) {
    // Poll may exist with zero snapshots — fall back to poll-only check.
    const polls = await db
      .select()
      .from(pricePolls)
      .where(sql`${pricePolls.status} IN ('success', 'partial')`)
      .orderBy(desc(pricePolls.recordedAt), desc(pricePolls.id))
      .limit(1);
    const poll = polls[0];
    if (!poll) return null;
    return {
      pollId: poll.id,
      recordedAt: poll.recordedAt as Date,
      status: poll.status,
      items: [],
    };
  }

  return {
    pollId: first.pollId,
    recordedAt: first.recordedAt as Date,
    status: first.status,
    items: rows.map((r) => ({
      itemCode: r.itemCode,
      marketPrice: r.marketPrice,
      buyMin: r.buyMin,
      buyMax: r.buyMax,
      buyAvg: r.buyAvg,
      sellMin: r.sellMin,
      sellMax: r.sellMax,
      sellAvg: r.sellAvg,
    })),
  };
}

export async function getLatestItemMarketPrice(
  db: Db,
  itemCode: string,
): Promise<{ price: Decimal; fetchedAt: Date; stale?: boolean } | null> {
  const latest = await getLatestPrices(db);
  if (!latest) return null;
  const row = latest.items.find((i) => i.itemCode === itemCode);
  if (!isFiniteMoney(row?.marketPrice)) return null;
  return {
    price: row.marketPrice,
    fetchedAt: latest.recordedAt,
  };
}

export function marketPriceMap(latest: LatestPrices): Record<string, Decimal> {
  const out: Record<string, Decimal> = {};
  for (const item of latest.items) {
    if (isFiniteMoney(item.marketPrice)) {
      out[item.itemCode] = item.marketPrice;
    }
  }
  return out;
}

/** Top buy (best bid) — Market UI "Buy". */
export function buyPriceMap(latest: LatestPrices): Record<string, Decimal> {
  const out: Record<string, Decimal> = {};
  for (const item of latest.items) {
    if (isFiniteMoney(item.buyMax)) {
      out[item.itemCode] = item.buyMax;
    }
  }
  return out;
}

/** Top sell (best ask) — Market UI "Sell". */
export function sellPriceMap(latest: LatestPrices): Record<string, Decimal> {
  const out: Record<string, Decimal> = {};
  for (const item of latest.items) {
    if (isFiniteMoney(item.sellMin)) {
      out[item.itemCode] = item.sellMin;
    }
  }
  return out;
}
