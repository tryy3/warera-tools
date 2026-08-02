import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../db/client";
import { upsertCompanyPack } from "../db/company-packs";
import { insertPricePoll, insertPriceSnapshots } from "../db/prices";
import * as schema from "../db/schema";
import { calculateProfitPerPp } from "../economy/profit";
import { listProducibleRecipes } from "../economy/recipes";
import { buildSkillsBootstrap, mapSkillsBootstrap } from "./bootstrap";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "skills-bootstrap-"));
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

const liteFixture = {
  userId: "u1",
  username: "Alice",
  leveling: {
    level: 12,
    availableSkillPoints: 5,
    spentSkillPoints: 15,
    totalSkillPoints: 20,
  },
  skillLevels: {
    energy: 2,
    entrepreneurship: 2,
    production: 3,
    companies: 2,
    combat: 1,
  },
  skillValues: {
    energy: 50,
    entrepreneurship: 40,
    production: 19,
    companies: 4,
    combat: 10,
  },
};

describe("mapSkillsBootstrap", () => {
  it("maps pack + prices + lite + job into skills bootstrap DTO", () => {
    const prices = { iron: 1, steel: 20, concrete: 5 };
    const ironPpp = calculateProfitPerPp("iron", prices)?.profitPerPp ?? 0;

    const result = mapSkillsBootstrap({
      recordedAt: "2026-08-01T12:00:00.000Z",
      companiesFetchedAt: 1_700_000_000_000,
      companiesRefreshed: false,
      packEntries: [
        {
          id: "c1",
          name: "Mine",
          itemCode: "iron",
          regionId: "r1",
          aeLevel: 3,
          productionBonus: 0.1,
          bonusDetails: null,
        },
        {
          id: "c2",
          name: "Idle",
          itemCode: null,
          regionId: null,
          aeLevel: 1,
          productionBonus: null,
          bonusDetails: null,
        },
      ],
      prices,
      lite: liteFixture,
      job: {
        status: "resolved",
        companyId: "employer-1",
        grossWage: 10,
        incomeTaxRate: 0.1,
        netWage: 9,
      },
    });

    expect(result.recordedAt).toBe("2026-08-01T12:00:00.000Z");
    expect(result.companiesFetchedAt).toBe(1_700_000_000_000);
    expect(result.companiesRefreshed).toBe(false);
    expect(result.leveling).toEqual(liteFixture.leveling);
    expect(result.skills).toEqual({
      energy: { level: 2, value: 50 },
      entrepreneurship: { level: 2, value: 40 },
      production: { level: 3, value: 19 },
      companies: { level: 2, value: 4 },
      combat: { level: 1, value: 10 },
    });
    expect(result.job).toEqual({
      status: "resolved",
      companyId: "employer-1",
      grossWage: 10,
      incomeTaxRate: 0.1,
      netWage: 9,
    });
    expect(result.companies).toEqual([
      {
        id: "c1",
        name: "Mine",
        aeLevel: 3,
        itemCode: "iron",
        productionBonus: 0.1,
        profitPerPp: ironPpp,
      },
      {
        id: "c2",
        name: "Idle",
        aeLevel: 1,
        itemCode: null,
        productionBonus: 0,
        profitPerPp: 0,
      },
    ]);
  });

  it("defaults missing skill values to 0 and unemployed job passthrough", () => {
    const result = mapSkillsBootstrap({
      recordedAt: null,
      companiesFetchedAt: null,
      companiesRefreshed: true,
      packEntries: [],
      prices: {},
      lite: {
        userId: "u2",
        username: "Bob",
        leveling: {
          level: 1,
          availableSkillPoints: 0,
          spentSkillPoints: 0,
          totalSkillPoints: 0,
        },
        skillLevels: { energy: 1 },
        skillValues: {},
      },
      job: { status: "unemployed" },
    });

    expect(result.skills).toEqual({ energy: { level: 1, value: 0 } });
    expect(result.job).toEqual({ status: "unemployed" });
    expect(result.companies).toEqual([]);
    expect(result.companiesRefreshed).toBe(true);
  });
});

describe("buildSkillsBootstrap", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createDb();
    await seedPrices(db);
  });

  it("loads pack, lite, and job in parallel and maps DTO", async () => {
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
          bonusDetails: null,
        },
      ],
      fetchedAt,
    });

    const request = vi.fn(async (path: string) => {
      if (path.includes("user.getUserLite")) {
        return {
          result: {
            data: {
              _id: "u1",
              username: "Alice",
              leveling: liteFixture.leveling,
              skills: {
                energy: { level: 2, total: 50 },
                entrepreneurship: { level: 2, total: 40 },
                production: { level: 3, total: 19 },
                companies: { level: 2, total: 4 },
              },
            },
          },
        };
      }
      if (path.includes("user.getUserById")) {
        return { result: { data: { _id: "u1", company: null } } };
      }
      if (path.includes("worker.getWorkers")) {
        return { result: { data: [] } };
      }
      throw new Error(`unexpected warera call: ${path}`);
    });

    const result = await buildSkillsBootstrap({
      db,
      warera: { request } as never,
      logger: logger as never,
      userId: "u1",
    });

    expect(result.recordedAt).toBe("2026-08-01T12:00:00.000Z");
    expect(result.companiesFetchedAt).toBe(fetchedAt.getTime());
    expect(result.companiesRefreshed).toBe(false);
    expect(result.leveling).toEqual(liteFixture.leveling);
    expect(result.skills.energy).toEqual({ level: 2, value: 50 });
    expect(result.companies).toHaveLength(1);
    expect(result.companies[0]).toMatchObject({
      id: "c1",
      name: "Mine",
      aeLevel: 3,
      itemCode: "iron",
      productionBonus: 0.1,
    });
    expect(result.companies[0]?.profitPerPp).toBeGreaterThan(0);
    expect(result.job.status).toBe("unemployed");
    expect(request).toHaveBeenCalled();
  });
});
