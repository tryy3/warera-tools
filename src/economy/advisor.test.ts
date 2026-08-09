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

function trpc(data: unknown) {
  return { result: { data } };
}

/** Live enrichment: workers + offer + company→region→country tax (not cache paths). */
function mockLiveCompanyEnrichment(path: string) {
  if (path.includes("worker.getWorkers")) {
    return trpc([
      {
        userId: "w1",
        userName: "Alice",
        wagePerPp: 1.2,
        energyLevel: 5,
        productionLevel: 3,
        fidelityPct: 4,
      },
    ]);
  }
  if (path.includes("workOffer.getWorkOfferByCompanyId")) {
    return trpc({ wagePerPp: 0.8 });
  }
  if (path.includes("company.getById")) {
    return trpc({
      _id: "c1",
      name: "Mine",
      region: "reg-home",
      itemCode: "iron",
      activeUpgradeLevels: { automatedEngine: 3 },
    });
  }
  if (path.includes("region.getById")) {
    return trpc({ name: "Home", countryCode: "SE", country: "country-se" });
  }
  if (path.includes("country.getCountryById")) {
    return trpc({ taxes: { income: 10 } });
  }
  return null;
}

async function seedWarmAdvisorCaches(db: Db): Promise<Date> {
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
  return fetchedAt;
}

describe("buildAdvisor caching", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createDb();
    await seedPrices(db);
    logger.debug.mockClear();
  });

  it("warm caches: no recommended/region/company pack WarEra calls", async () => {
    const fetchedAt = await seedWarmAdvisorCaches(db);

    const request = vi.fn(async (path: string) => {
      const enrichment = mockLiveCompanyEnrichment(path);
      if (enrichment) return enrichment;
      throw new Error(`unexpected cache-path call ${path}`);
    });

    const result = await buildAdvisor({
      db,
      warera: { request } as never,
      logger: logger as never,
      userId: "u1",
    });

    for (const [path] of request.mock.calls) {
      expect(String(path)).not.toMatch(/getRecommendedRegion|getCompanies|getProductionBonus/);
    }
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

  it("attaches workers, income tax, and offer wage per company", async () => {
    await seedWarmAdvisorCaches(db);

    const request = vi.fn(async (path: string) => {
      const enrichment = mockLiveCompanyEnrichment(path);
      if (enrichment) return enrichment;
      throw new Error(`unexpected ${path}`);
    });

    const result = await buildAdvisor({
      db,
      warera: { request } as never,
      logger: logger as never,
      userId: "u1",
    });

    const row = result.companies[0]!;
    expect(row.workersStatus).toBe("ok");
    expect(row.workers).toEqual([
      {
        userId: "w1",
        username: "Alice",
        wagePerPp: 1.2,
        energyLevel: 5,
        productionLevel: 3,
        fidelityPct: 4,
      },
    ]);
    expect(row.incomeTaxRate).toBe(0.1);
    expect(row.incomeTaxAssumed).toBe(false);
    expect(row.offerWagePerPp).toBe(0.8);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        keys: expect.arrayContaining(["userId", "userName"]),
        sample: expect.objectContaining({ userId: "w1" }),
      }),
      "worker.getWorkers first object keys",
    );
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: "c1",
        workers: [
          expect.objectContaining({
            user_id: "w1",
            fields: {
              wagePerPp: { value: 1.2, source: "api" },
              energyLevel: { value: 5, source: "api" },
              productionLevel: { value: 3, source: "api" },
              fidelityPct: { value: 4, source: "api" },
            },
          }),
        ],
      }),
      "worker field sources from worker.getWorkers",
    );
  });

  it("soft-fails worker enrichment per company when WarEra throws", async () => {
    await seedWarmAdvisorCaches(db);

    const request = vi.fn(async () => {
      throw new Error("worker endpoint down");
    });

    const result = await buildAdvisor({
      db,
      warera: { request } as never,
      logger: logger as never,
      userId: "u1",
    });

    const row = result.companies[0]!;
    expect(row.company.id).toBe("c1");
    expect(row.workersStatus).toBe("unavailable");
    expect(row.workers).toEqual([]);
    expect(row.incomeTaxRate).toBe(0);
    expect(row.incomeTaxAssumed).toBe(true);
    expect(row.offerWagePerPp).toBeNull();
  });

  it("keeps workers when work offer is missing but worker.getWorkers succeeds", async () => {
    await seedWarmAdvisorCaches(db);

    const request = vi.fn(async (path: string) => {
      if (path.includes("worker.getWorkers")) {
        return trpc({
          type: "company",
          workers: [
            {
              _id: "wd1",
              user: "w1",
              company: "c1",
              wage: 1.2,
              fidelity: 4,
            },
          ],
        });
      }
      if (path.includes("workOffer.getWorkOfferByCompanyId")) {
        throw new Error("WarEra request failed: 404 Workoffers not found.");
      }
      const enrichment = mockLiveCompanyEnrichment(path);
      if (enrichment) return enrichment;
      throw new Error(`unexpected ${path}`);
    });

    const result = await buildAdvisor({
      db,
      warera: { request } as never,
      logger: logger as never,
      userId: "u1",
    });

    const row = result.companies[0]!;
    expect(row.workersStatus).toBe("ok");
    expect(row.workers).toEqual([
      {
        userId: "w1",
        username: null,
        wagePerPp: 1.2,
        energyLevel: null,
        productionLevel: null,
        fidelityPct: 4,
      },
    ]);
    expect(row.offerWagePerPp).toBeNull();
    expect(row.incomeTaxRate).toBe(0.1);
    expect(row.incomeTaxAssumed).toBe(false);
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
      if (String(path).includes("worker.getWorkers")) return trpc([]);
      if (String(path).includes("workOffer.getWorkOfferByCompanyId")) {
        return trpc({ wagePerPp: 0.5 });
      }
      if (String(path).includes("region.getById")) {
        return trpc({ name: "Home", countryCode: "SE", country: "country-se" });
      }
      if (String(path).includes("country.getCountryById")) {
        return trpc({ taxes: { income: 0 } });
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
    expect(result.companies[0]?.workersStatus).toBe("ok");
    expect(result.companies[0]?.offerWagePerPp).toBe(0.5);
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
        return {
          result: { data: { name: "LiveRegion", countryCode: "FI", country: "country-fi" } },
        };
      }
      if (String(path).includes("worker.getWorkers")) return trpc([]);
      if (String(path).includes("workOffer.getWorkOfferByCompanyId")) return trpc({});
      if (String(path).includes("company.getById")) {
        return trpc({
          _id: "c1",
          name: "Mine",
          region: "reg-home",
          itemCode: "iron",
          activeUpgradeLevels: { automatedEngine: 3 },
        });
      }
      if (String(path).includes("country.getCountryById")) {
        return trpc({ taxes: { income: 5 } });
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
