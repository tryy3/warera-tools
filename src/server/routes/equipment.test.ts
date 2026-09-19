import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { insertItemMarketTransactionsIgnoreConflicts } from "../../db/item-market-transactions";
import { insertPricePoll, insertPriceSnapshots } from "../../db/prices";
import type { Db } from "../../db/client";
import { createTestDb, truncateAllTables } from "../../db/test/postgres";
import * as schema from "../../db/schema";
import { MARKET_WINDOW_MS } from "../../equipment/windows";
import type { Logger } from "../../logging/logger";
import type { ItemMarketTransaction } from "../../warera/transactions";
import { errorPayload } from "../errors";
import { equipmentRoutes } from "./equipment";

const silentLogger = {
  silly: () => {},
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => silentLogger,
} as unknown as Logger;

async function seedCountry(
  db: Db,
  row: { id: string; name: string; taxRate: number },
): Promise<void> {
  const now = new Date();
  await db.insert(schema.countries).values({
    id: row.id,
    name: row.name,
    taxRate: row.taxRate,
    isoCode: null,
    source: "manual",
    syncedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

async function seedSteel(db: Db, marketPrice: number, recordedAt = new Date()): Promise<void> {
  const pollId = await insertPricePoll(db, {
    recordedAt,
    status: "success",
    itemCount: 1,
  });
  await insertPriceSnapshots(db, pollId, [
    {
      itemCode: "steel",
      marketPrice,
      buyMin: null,
      buyMax: null,
      buyAvg: null,
      sellMin: null,
      sellMax: null,
      sellAvg: null,
    },
  ]);
}

async function seedScrap(db: Db, marketPrice: number, recordedAt = new Date()): Promise<void> {
  const pollId = await insertPricePoll(db, {
    recordedAt,
    status: "success",
    itemCount: 1,
  });
  await insertPriceSnapshots(db, pollId, [
    {
      itemCode: "scraps",
      marketPrice,
      buyMin: null,
      buyMax: null,
      buyAvg: null,
      sellMin: null,
      sellMax: null,
      sellAvg: null,
    },
  ]);
}

function makeTx(overrides: Partial<ItemMarketTransaction> = {}): ItemMarketTransaction {
  return {
    id: "tx1",
    money: 37.79,
    itemCode: "chest4",
    quantity: 1,
    sellerId: "seller1",
    buyerId: "buyer1",
    transactionType: "itemMarket",
    itemId: "item1",
    itemType: "equipment",
    itemState: 100,
    itemMaxState: 100,
    itemQuantity: 1,
    itemLastAcquisitionAt: new Date("2026-08-04T15:47:56.698Z"),
    skills: { armor: 22 },
    offerCreatedAt: new Date("2026-08-04T15:48:20.018Z"),
    createdAt: new Date(),
    updatedAt: new Date(),
    payload: { __v: 0 },
    ...overrides,
  };
}

function appFor(db: Db) {
  const app = new Hono();
  app.onError((err, c) => {
    const { status, body } = errorPayload(err);
    return c.json(body, status as ContentfulStatusCode);
  });
  app.route(
    "/",
    equipmentRoutes({
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

describe("GET /overview", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("returns aggregated equipment overview with scrap meta", async () => {
    const recordedAt = new Date("2026-08-05T10:00:00.000Z");
    await seedScrap(db, 0.2, recordedAt);

    const now = Date.now();
    await insertItemMarketTransactionsIgnoreConflicts(db, [
      makeTx({
        id: "a",
        itemCode: "chest4",
        money: 40,
        createdAt: new Date(now - 60_000),
      }),
      makeTx({
        id: "b",
        itemCode: "chest4",
        money: 50,
        createdAt: new Date(now - 30_000),
      }),
    ]);

    const res = await appFor(db).request("http://localhost/overview");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      windowMs: number;
      scrapPrice: number | null;
      scrapedAt: string | null;
      items: Array<{
        itemCode: string;
        tier: string | null;
        marketMedian: number | null;
        scrapFloor: number | null;
        spread: number | null;
        trades: number;
      }>;
    };

    expect(body.windowMs).toBe(MARKET_WINDOW_MS);
    expect(body.scrapPrice).toBe(0.2);
    expect(body.scrapedAt).toBe(recordedAt.toISOString());
    expect(body.items).toHaveLength(1);
    const row = body.items[0]!;
    expect(row.itemCode).toBe("chest4");
    expect(row.tier).toBe("purple");
    expect(row.marketMedian).toBe(45);
    expect(row.scrapFloor).toBe(32.4);
    expect(row.spread).toBeCloseTo(12.6);
    expect(row.trades).toBe(2);
  });

  it("returns empty items and null scrap when nothing is seeded", async () => {
    const res = await appFor(db).request("http://localhost/overview");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      windowMs: number;
      scrapPrice: number | null;
      scrapedAt: string | null;
      items: unknown[];
    };
    expect(body.windowMs).toBe(MARKET_WINDOW_MS);
    expect(body.scrapPrice).toBeNull();
    expect(body.scrapedAt).toBeNull();
    expect(body.items).toEqual([]);
  });
});

describe("GET /:itemCode", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("returns detail with skill bands, country tax, and triad", async () => {
    await seedScrap(db, 0.2);
    await seedCountry(db, { id: "sweden", name: "Sweden", taxRate: 0.01 });

    const now = Date.now();
    await insertItemMarketTransactionsIgnoreConflicts(db, [
      makeTx({
        id: "a",
        itemCode: "chest4",
        money: 40,
        skills: { armor: 22 },
        createdAt: new Date(now - 60_000),
      }),
      makeTx({
        id: "b",
        itemCode: "chest4",
        money: 50,
        skills: { armor: 22 },
        createdAt: new Date(now - 30_000),
      }),
      makeTx({
        id: "c",
        itemCode: "chest4",
        money: 90,
        skills: { armor: 30 },
        createdAt: new Date(now - 20_000),
      }),
      makeTx({
        id: "other",
        itemCode: "helmet4",
        money: 10,
        skills: { armor: 22 },
        createdAt: new Date(now - 10_000),
      }),
    ]);

    const skills = encodeURIComponent(JSON.stringify([{ key: "armor", target: 22, band: 0 }]));
    const res = await appFor(db).request(
      `http://localhost/chest4?skills=${skills}&countryId=sweden`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      itemCode: string;
      tier: string | null;
      scrapPrice: number | null;
      taxRate: number | null;
      countryId: string | null;
      marketMedian: number | null;
      sellerNet: number | null;
      scrapFloor: number | null;
      recommend: { scrapFloor: number; breakEvenIncl: number; attractiveIncl: number } | null;
      trades: number;
      activeBands: Array<{ key: string; target: number; band: number }>;
      lowestObserved: Record<string, number> | null;
    };

    expect(body.itemCode).toBe("chest4");
    expect(body.tier).toBe("purple");
    expect(body.scrapPrice).toBe(0.2);
    expect(body.taxRate).toBe(0.01);
    expect(body.countryId).toBe("sweden");
    expect(body.activeBands).toEqual([{ key: "armor", target: 22, band: 0 }]);
    expect(body.lowestObserved).toEqual({ armor: 22 });
    expect(body.marketMedian).toBe(45);
    expect(body.trades).toBe(2);
    expect(body.sellerNet).toBeCloseTo(45 / 1.01, 5);
    expect(body.scrapFloor).toBe(32.4);
    expect(body.recommend?.scrapFloor).toBe(32.4);
    expect(body.recommend?.breakEvenIncl).toBeCloseTo(32.4 * 1.01, 5);
  });

  it("defaults skills to lowestObserved band 1 when skills omitted", async () => {
    await seedScrap(db, 0.2);
    await seedCountry(db, { id: "sweden", name: "Sweden", taxRate: 0.01 });
    const now = Date.now();
    await insertItemMarketTransactionsIgnoreConflicts(db, [
      makeTx({
        id: "a",
        money: 40,
        skills: { armor: 22 },
        createdAt: new Date(now - 60_000),
      }),
      makeTx({
        id: "b",
        money: 80,
        skills: { armor: 30 },
        createdAt: new Date(now - 30_000),
      }),
    ]);

    const res = await appFor(db).request("http://localhost/chest4?countryId=sweden");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      activeBands: Array<{ key: string; target: number; band: number }>;
      marketMedian: number | null;
      trades: number;
    };
    expect(body.activeBands).toEqual([{ key: "armor", target: 22, band: 1 }]);
    expect(body.marketMedian).toBe(40);
    expect(body.trades).toBe(1);
  });

  it("nulls tax-dependent fields when country is missing", async () => {
    await seedScrap(db, 0.2);
    const now = Date.now();
    await insertItemMarketTransactionsIgnoreConflicts(db, [
      makeTx({
        id: "a",
        money: 40,
        skills: { armor: 22 },
        createdAt: new Date(now - 60_000),
      }),
    ]);

    const skills = encodeURIComponent(JSON.stringify([{ key: "armor", target: 22, band: 1 }]));
    const res = await appFor(db).request(`http://localhost/chest4?skills=${skills}&countryId=nope`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      taxRate: number | null;
      sellerNet: number | null;
      recommend: unknown;
      scrapFloor: number | null;
      marketMedian: number | null;
    };
    expect(body.taxRate).toBeNull();
    expect(body.sellerNet).toBeNull();
    expect(body.recommend).toBeNull();
    expect(body.scrapFloor).toBe(32.4);
    expect(body.marketMedian).toBe(40);
  });

  it("rejects malformed skills query with 400", async () => {
    const res = await appFor(db).request("http://localhost/chest4?skills=not-json");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("skills");
  });
});

describe("GET /craft-compare", () => {
  type CraftCompareBody = {
    tier: string;
    windowMs: number;
    scrapQty: number;
    steelRandom: number;
    steelSpecific: number;
    steelPrice: number | null;
    steelCostRandom: number | null;
    taxRate: number;
    specific: Array<{ itemCode: string }>;
    random: { medianAdvantage: number | null };
  };

  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("returns craft compare for a tier", async () => {
    await seedCountry(db, { id: "sweden", name: "Sweden", taxRate: 0.01 });
    await seedScrap(db, 0.2);
    await seedSteel(db, 1.5);
    await insertItemMarketTransactionsIgnoreConflicts(db, [
      makeTx({
        id: "j1",
        itemCode: "jet",
        money: 500,
        createdAt: new Date(),
      }),
    ]);

    const res = await appFor(db).request(
      "http://localhost/craft-compare?tier=red&countryId=sweden",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CraftCompareBody;
    expect(body.tier).toBe("red");
    expect(body.windowMs).toBe(MARKET_WINDOW_MS);
    expect(body.scrapQty).toBe(1460);
    expect(body.steelRandom).toBe(32);
    expect(body.steelSpecific).toBe(64);
    expect(body.taxRate).toBe(0.01);
    expect(body.specific.some((r: { itemCode: string }) => r.itemCode === "jet")).toBe(true);
    expect(body.random).toBeTruthy();
  });

  it("returns 400 when tier is missing or unknown", async () => {
    await seedCountry(db, { id: "sweden", name: "Sweden", taxRate: 0.01 });
    const missing = await appFor(db).request("http://localhost/craft-compare?countryId=sweden");
    expect(missing.status).toBe(400);
    const bad = await appFor(db).request(
      "http://localhost/craft-compare?tier=orange&countryId=sweden",
    );
    expect(bad.status).toBe(400);
  });

  it("returns 400 when countryId is missing or unknown", async () => {
    const missing = await appFor(db).request("http://localhost/craft-compare?tier=red");
    expect(missing.status).toBe(400);
    const unknown = await appFor(db).request(
      "http://localhost/craft-compare?tier=red&countryId=nope",
    );
    expect(unknown.status).toBe(400);
  });

  it("returns null cost fields when scrap or steel price missing", async () => {
    await seedCountry(db, { id: "sweden", name: "Sweden", taxRate: 0.01 });
    await seedScrap(db, 0.2);
    // no steel
    const res = await appFor(db).request(
      "http://localhost/craft-compare?tier=red&countryId=sweden",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CraftCompareBody;
    expect(body.steelPrice).toBeNull();
    expect(body.steelCostRandom).toBeNull();
    expect(body.random.medianAdvantage).toBeNull();
  });
});
