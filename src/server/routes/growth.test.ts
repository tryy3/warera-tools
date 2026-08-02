import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import { upsertCompanyPack } from "../../db/company-packs";
import { insertPricePoll, insertPriceSnapshots } from "../../db/prices";
import * as schema from "../../db/schema";
import { listProducibleRecipes } from "../../economy/recipes";
import type { Logger } from "../../logging/logger";
import { errorPayload } from "../errors";
import { growthRoutes } from "./growth";

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => silentLogger,
} as unknown as Logger;

async function createMemoryDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "growth-route-"));
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

function appFor(db: Db) {
  const app = new Hono();
  app.onError((err, c) => {
    const { status, body } = errorPayload(err);
    return c.json(body, status as ContentfulStatusCode);
  });
  app.route(
    "/",
    growthRoutes({
      db,
      warera: {
        request: async () => {
          throw new Error("unused");
        },
      },
      logger: silentLogger,
    }),
  );
  return app;
}

describe("GET /bootstrap", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createMemoryDb();
    await seedPrices(db);
  });

  it("400s without userId", async () => {
    const res = await appFor(db).request("http://localhost/bootstrap");
    expect(res.status).toBe(400);
  });

  it("returns lean bootstrap shape for a fixture user", async () => {
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

    const res = await appFor(db).request("http://localhost/bootstrap?userId=u1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.startBalance).toBe(0);
    expect(body.steel).toBe(0);
    expect(body.concrete).toBe(0);
    expect(body.companies).toHaveLength(1);
    expect(body.companies[0]).toMatchObject({
      id: "c1",
      name: "Mine",
      aeLevel: 3,
      itemCode: "iron",
      productionBonus: 0.1,
    });
    expect(body.companies[0]).not.toHaveProperty("bestSwitch");
    expect(body.opportunitiesLite.length).toBeGreaterThan(0);
    expect(body.bestItem).toHaveProperty("itemCode");
    expect(body.bestItem).toHaveProperty("suggestedBonus");
    expect(body.prices.steel).toBe(20);
    expect(body.prices.concrete).toBe(5);
    expect(body).not.toHaveProperty("opportunities");
  });

  it("accepts refresh=1", async () => {
    await upsertCompanyPack(db, {
      userId: "u1",
      companies: [
        {
          id: "old",
          name: "Old",
          itemCode: "iron",
          regionId: null,
          aeLevel: 1,
          productionBonus: 0,
          bonusDetails: null,
        },
      ],
      fetchedAt: new Date(),
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
              region: null,
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

    const app = new Hono();
    app.onError((err, c) => {
      const { status, body } = errorPayload(err);
      return c.json(body, status as ContentfulStatusCode);
    });
    app.route(
      "/",
      growthRoutes({
        db,
        warera: { request } as never,
        logger: silentLogger,
      }),
    );

    const res = await app.request("http://localhost/bootstrap?userId=u1&refresh=1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.companiesRefreshed).toBe(true);
    expect(body.companies[0]?.id).toBe("c-new");
  });
});
