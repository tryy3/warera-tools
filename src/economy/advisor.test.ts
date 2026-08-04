import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../db/client";
import { upsertCompanyPack } from "../db/company-packs";
import { insertPricePoll, insertPriceSnapshots } from "../db/prices";
import { getRecommendedRegion, upsertRecommendedRegion } from "../db/recommended-regions";
import { upsertRegionFetched } from "../db/regions";
import * as schema from "../db/schema";
import { listProducibleRecipes } from "./recipes";
import { explainAeDaily } from "./profit";
import { buildAdvisor } from "./advisor";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "advisor-"));
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
    CREATE TABLE recommended_regions (
      item_code TEXT PRIMARY KEY NOT NULL,
      region_id TEXT NOT NULL,
      region_name TEXT,
      bonus REAL,
      payload TEXT,
      fetched_at INTEGER NOT NULL
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
  await client.execute(`
    CREATE TABLE company_packs (
      user_id TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      ttl_seconds INTEGER NOT NULL DEFAULT 600
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

describe("buildAdvisor caching", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createDb();
    await seedPrices(db);
  });

  it("warm caches: no recommended/region/company WarEra calls", async () => {
    const fetchedAt = new Date();
    await upsertCompanyPack(db, {
      userId: "u1",
      companies: [
        {
          id: "c1",
          name: "Mine",
          itemCode: "iron",
          regionId: "reg-home",
          aeLevel: 3,
          productionBonus: 0.1,
          bonusDetails: {
            total: 0.1,
            strategicBonus: 0.1,
            depositBonus: 0,
            ethicSpecializationBonus: 0,
            ethicDepositBonus: 0,
            formula: "total 10%",
          },
        },
      ],
      fetchedAt,
    });
    await upsertRegionFetched(db, {
      id: "reg-home",
      name: "Home",
      countryCode: "SE",
      fetchedAt,
    });
    for (const recipe of listProducibleRecipes()) {
      await upsertRecommendedRegion(db, {
        itemCode: recipe.itemCode,
        regionId: "reg-best",
        regionName: "Best",
        bonus: 0.5,
        payload: null,
        fetchedAt,
      });
    }
    await upsertRegionFetched(db, {
      id: "reg-best",
      name: "Best",
      countryCode: "NO",
      fetchedAt,
    });

    const request = vi.fn(async () => {
      throw new Error("warera should not be called");
    });

    const result = await buildAdvisor({
      db,
      warera: { request } as never,
      logger: logger as never,
      userId: "u1",
    });

    expect(request).not.toHaveBeenCalled();
    expect(result.companiesRefreshed).toBe(false);
    expect(result.companies).toHaveLength(1);
    expect(result.companies[0]?.company.regionName).toBe("Home");
    expect(result.companiesFetchedAt).toBe(fetchedAt.getTime());

    const ironOpp = result.opportunities.find((o) => o.itemCode === "iron");
    expect(ironOpp).toMatchObject({
      referenceAeLevel: 6,
      bestBonus: 0.5,
    });
    expect(ironOpp?.roughDailyValue).toBe(explainAeDaily(6, 0.5, ironOpp!.profitPerPp!).dailyValue);
    const steelOpp = result.opportunities.find((o) => o.itemCode === "steel");
    expect(steelOpp).toMatchObject({
      referenceAeLevel: 6,
      bestBonus: 0.5,
    });
    expect(steelOpp?.roughDailyValue).toBe(
      explainAeDaily(6, 0.5, steelOpp!.profitPerPp!).dailyValue,
    );
    for (let i = 1; i < result.opportunities.length; i++) {
      expect(result.opportunities[i - 1]!.profitPerPp!).toBeGreaterThanOrEqual(
        result.opportunities[i]!.profitPerPp!,
      );
    }
  });

  it("refresh=true refetches company pack even when fresh", async () => {
    const fetchedAt = new Date();
    await upsertCompanyPack(db, {
      userId: "u1",
      companies: [
        {
          id: "old",
          name: "Old",
          itemCode: "iron",
          regionId: "reg-home",
          aeLevel: 1,
          productionBonus: 0,
          bonusDetails: null,
        },
      ],
      fetchedAt,
    });
    await upsertRegionFetched(db, {
      id: "reg-home",
      name: "Home",
      countryCode: "SE",
      fetchedAt,
    });
    for (const recipe of listProducibleRecipes()) {
      await upsertRecommendedRegion(db, {
        itemCode: recipe.itemCode,
        regionId: "reg-best",
        regionName: "Best",
        bonus: 0.2,
        payload: null,
        fetchedAt,
      });
    }
    await upsertRegionFetched(db, {
      id: "reg-best",
      name: "Best",
      countryCode: "NO",
      fetchedAt,
    });

    const request = vi.fn(async (path: string) => {
      if (String(path).includes("company.getCompanies")) {
        return { result: { data: { items: ["c-new"] } } };
      }
      if (String(path).includes("company.getById")) {
        return {
          result: {
            data: {
              _id: "c-new",
              name: "Fresh Co",
              itemCode: "iron",
              region: "reg-home",
              activeUpgradeLevels: { automatedEngine: 2 },
            },
          },
        };
      }
      if (String(path).includes("company.getProductionBonus")) {
        return { result: { data: { total: 10 } } };
      }
      throw new Error(`unexpected path ${path}`);
    });

    const result = await buildAdvisor({
      db,
      warera: { request } as never,
      logger: logger as never,
      userId: "u1",
      refresh: true,
    });

    expect(result.companiesRefreshed).toBe(true);
    expect(result.companies[0]?.company.id).toBe("c-new");
    expect(result.companies[0]?.company.name).toBe("Fresh Co");
  });

  it("miss on recommended region live-fetches and persists", async () => {
    const fetchedAt = new Date();
    await upsertCompanyPack(db, {
      userId: "u1",
      companies: [
        {
          id: "c1",
          name: "Mine",
          itemCode: "iron",
          regionId: "reg-home",
          aeLevel: 3,
          productionBonus: 0,
          bonusDetails: null,
        },
      ],
      fetchedAt,
    });
    await upsertRegionFetched(db, {
      id: "reg-home",
      name: "Home",
      countryCode: "SE",
      fetchedAt,
    });

    const request = vi.fn(async (path: string, opts?: { json?: { itemCode: string } }) => {
      if (path === "company.getRecommendedRegionIdsByItemCode") {
        const itemCode = opts?.json?.itemCode ?? "x";
        return {
          result: {
            data: [{ regionId: `reg-${itemCode}`, name: "Live", bonus: 25 }],
          },
        };
      }
      if (String(path).includes("region.getById")) {
        return { result: { data: { name: "LiveRegion", countryCode: "FI" } } };
      }
      throw new Error(`unexpected ${path}`);
    });

    await buildAdvisor({
      db,
      warera: { request } as never,
      logger: logger as never,
      userId: "u1",
    });

    expect(await getRecommendedRegion(db, "steel")).not.toBeNull();
    expect(request).toHaveBeenCalled();
  });
});
