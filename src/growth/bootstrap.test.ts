import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../db/client";
import { insertPricePoll, insertPriceSnapshots } from "../db/prices";
import * as schema from "../db/schema";
import { listProducibleRecipes } from "../economy/recipes";
import { buildGrowthBootstrap, mapGrowthBootstrap } from "./bootstrap";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "growth-bootstrap-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
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
      sell_avg REAL
    )
  `);
  await client.execute(`
    CREATE TABLE regions (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      country_code TEXT,
      payload TEXT,
      fetched_at INTEGER,
      enqueued_at INTEGER NOT NULL
    )
  `);
  return drizzle(client, { schema });
}

async function seedPrices(db: Db): Promise<void> {
  const pollId = await insertPricePoll(db, {
    recordedAt: new Date("2026-08-01T12:00:00.000Z"),
    status: "success",
    itemCount: 3,
  });
  await insertPriceSnapshots(db, pollId, [
    {
      itemCode: "iron",
      marketPrice: 1,
      buyMin: null,
      buyMax: null,
      buyAvg: null,
      sellMin: null,
      sellMax: null,
      sellAvg: null,
    },
    {
      itemCode: "steel",
      marketPrice: 20,
      buyMin: null,
      buyMax: null,
      buyAvg: null,
      sellMin: null,
      sellMax: null,
      sellAvg: null,
    },
    {
      itemCode: "concrete",
      marketPrice: 5,
      buyMin: null,
      buyMax: null,
      buyAvg: null,
      sellMin: null,
      sellMax: null,
      sellAvg: null,
    },
    ...listProducibleRecipes()
      .filter((r) => !["iron", "steel", "concrete"].includes(r.itemCode))
      .map((r) => ({
        itemCode: r.itemCode,
        marketPrice: 2,
        buyMin: null,
        buyMax: null,
        buyAvg: null,
        sellMin: null,
        sellMax: null,
        sellAvg: null,
      })),
  ]);
}

const logger = {
  silly: vi.fn(),
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn(),
};

describe("mapGrowthBootstrap", () => {
  it("maps prices, opportunities, and defaults inventory to 0", () => {
    const result = mapGrowthBootstrap({
      recordedAt: "2026-08-01T12:00:00.000Z",
      prices: { iron: 1, steel: 20, concrete: 5 },
      opportunities: [
        { itemCode: "steel", profitPerPp: 0.5 },
        { itemCode: "iron", profitPerPp: 0.2 },
      ],
    });

    expect(result.startBalance).toBe(0);
    expect(result.steel).toBe(0);
    expect(result.concrete).toBe(0);
    expect(result.prices).toEqual({ steel: 20, concrete: 5 });
    expect(result.opportunitiesLite).toEqual([
      { itemCode: "steel", profitPerPp: 0.5 },
      { itemCode: "iron", profitPerPp: 0.2 },
    ]);
    expect(result.bestItem).toEqual({
      itemCode: "steel",
      profitPerPp: 0.5,
      suggestedBonus: 0,
    });
    expect(result).not.toHaveProperty("companies");
    expect(result).not.toHaveProperty("companiesFetchedAt");
    expect(result).not.toHaveProperty("companiesRefreshed");
    expect(result).not.toHaveProperty("opportunities");
  });

  it("uses suggestedBonus 0 when no company bonuses", () => {
    const result = mapGrowthBootstrap({
      recordedAt: null,
      prices: {},
      opportunities: [{ itemCode: "iron", profitPerPp: 0.1 }],
    });
    expect(result.bestItem?.suggestedBonus).toBe(0);
    expect(result.prices).toEqual({ steel: null, concrete: null });
  });
});

describe("buildGrowthBootstrap", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createDb();
    await seedPrices(db);
  });

  it("returns prices and opportunities without loading company pack", async () => {
    const request = vi.fn(async () => {
      throw new Error("warera should not be called");
    });

    const result = await buildGrowthBootstrap({
      db,
      warera: { request } as never,
      logger: logger as never,
      userId: "u1",
    });

    expect(result).not.toHaveProperty("companies");
    expect(result).not.toHaveProperty("companiesFetchedAt");
    expect(result).not.toHaveProperty("companiesRefreshed");
    expect(result).toHaveProperty("opportunitiesLite");
    expect(result).toHaveProperty("bestItem");
    expect(result.startBalance).toBe(0);
    expect(result.steel).toBe(0);
    expect(result.concrete).toBe(0);
    expect(result.recordedAt).toBe("2026-08-01T12:00:00.000Z");
    expect(result.prices.steel).toBe(20);
    expect(result.prices.concrete).toBe(5);
    expect(result.bestItem?.suggestedBonus).toBe(0);
    expect(result).not.toHaveProperty("opportunities");
    expect(request).not.toHaveBeenCalled();
  });
});
