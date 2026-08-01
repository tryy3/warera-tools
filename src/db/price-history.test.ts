import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { insertPricePoll, insertPriceSnapshots } from "./prices";
import type { Db } from "./client";
import * as schema from "./schema";
import { getItemPriceHistory } from "./price-history";

async function createMemoryDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  await client.execute(`
    CREATE TABLE price_polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      recorded_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      item_count INTEGER DEFAULT 0 NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE price_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      poll_id INTEGER NOT NULL,
      item_code TEXT NOT NULL,
      market_price REAL,
      buy_min REAL,
      buy_max REAL,
      buy_avg REAL,
      sell_min REAL,
      sell_max REAL,
      sell_avg REAL,
      FOREIGN KEY (poll_id) REFERENCES price_polls(id)
    )
  `);
  return drizzle(client, { schema });
}

async function seedSnapshot(
  db: Db,
  recordedAt: Date,
  itemCode: string,
  marketPrice: number,
  buyMax: number,
  sellMin: number,
) {
  const pollId = await insertPricePoll(db, {
    recordedAt,
    status: "success",
    itemCount: 1,
  });
  await insertPriceSnapshots(db, pollId, [
    {
      itemCode,
      marketPrice,
      buyMin: buyMax,
      buyMax,
      buyAvg: buyMax,
      sellMin,
      sellMax: sellMin,
      sellAvg: sellMin,
    },
  ]);
}

describe("getItemPriceHistory", () => {
  let db: Db;
  const now = new Date("2026-08-01T12:00:00.000Z");

  beforeEach(async () => {
    db = await createMemoryDb();
  });

  it("returns null for unknown item", async () => {
    expect(await getItemPriceHistory(db, "steel", "7d", now)).toBeNull();
  });

  it("windows points and computes 24h/7d changes from market baselines", async () => {
    await seedSnapshot(db, new Date("2026-07-24T12:00:00.000Z"), "steel", 1.0, 0.9, 1.1);
    await seedSnapshot(db, new Date("2026-07-30T12:00:00.000Z"), "steel", 1.5, 1.4, 1.6);
    await seedSnapshot(db, new Date("2026-08-01T12:00:00.000Z"), "steel", 1.65, 1.55, 1.7);

    const history = await getItemPriceHistory(db, "steel", "7d", now);
    expect(history).not.toBeNull();
    expect(history!.range).toBe("7d");
    expect(history!.points).toHaveLength(2); // excludes 8d-old point
    expect(history!.latest?.marketPrice).toBe(1.65);
    expect(history!.latest?.topBuy).toBe(1.55);
    expect(history!.latest?.topSell).toBe(1.7);
    // baseline ~now-24h → 1.5; baseline ~now-7d → 1.0
    expect(history!.change24h).toEqual({
      absolute: expect.closeTo(0.15, 8),
      percent: expect.closeTo(10, 8),
    });
    expect(history!.change7d).toEqual({
      absolute: expect.closeTo(0.65, 8),
      percent: expect.closeTo(65, 8),
    });
  });

  it("ignores error polls", async () => {
    const pollId = await insertPricePoll(db, {
      recordedAt: now,
      status: "error",
      itemCount: 0,
    });
    await insertPriceSnapshots(db, pollId, [
      {
        itemCode: "steel",
        marketPrice: 9,
        buyMin: null,
        buyMax: null,
        buyAvg: null,
        sellMin: null,
        sellMax: null,
        sellAvg: null,
      },
    ]);
    expect(await getItemPriceHistory(db, "steel", "7d", now)).toBeNull();
  });

  it("includes partial polls", async () => {
    const pollId = await insertPricePoll(db, {
      recordedAt: now,
      status: "partial",
      itemCount: 1,
    });
    await insertPriceSnapshots(db, pollId, [
      {
        itemCode: "steel",
        marketPrice: 2.5,
        buyMin: 2.4,
        buyMax: 2.4,
        buyAvg: 2.4,
        sellMin: 2.6,
        sellMax: 2.6,
        sellAvg: 2.6,
      },
    ]);

    const history = await getItemPriceHistory(db, "steel", "7d", now);
    expect(history).not.toBeNull();
    expect(history!.points).toHaveLength(1);
    expect(history!.latest?.marketPrice).toBe(2.5);
  });

  it("filters history by item code", async () => {
    await seedSnapshot(db, now, "grain", 0.5, 0.4, 0.6);

    expect(await getItemPriceHistory(db, "steel", "7d", now)).toBeNull();

    const grain = await getItemPriceHistory(db, "grain", "7d", now);
    expect(grain).not.toBeNull();
    expect(grain!.points).toHaveLength(1);
    expect(grain!.latest?.marketPrice).toBe(0.5);
  });
});
