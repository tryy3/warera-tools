import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { emptyLoadout } from "../../battle-build/slots";
import type { Db } from "../../db/client";
import { createTestDb, truncateAllTables } from "../../db/test/postgres";
import { insertItemMarketTransactionsIgnoreConflicts } from "../../db/item-market-transactions";
import type { Logger } from "../../logging/logger";
import type { WareraRequester } from "../../warera/prices";
import type { ItemMarketTransaction } from "../../warera/transactions";
import { errorPayload } from "../errors";
import { battleBuildRoutes } from "./battle-build";

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
    itemLastAcquisitionAt: new Date(),
    skills: { armor: 22 },
    offerCreatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    payload: {},
    ...overrides,
  };
}

function appFor(db: Db, warera?: WareraRequester) {
  const app = new Hono();
  app.onError((err, c) => {
    const { status, body } = errorPayload(err);
    return c.json(body, status as ContentfulStatusCode);
  });
  app.route(
    "/",
    battleBuildRoutes({
      db,
      warera: warera ?? {
        request: async <T>() => ({ result: { data: [] } }) as T,
      },
      logger: silentLogger,
    }),
  );
  return app;
}

describe("POST /quote", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("returns a 24h median from stored item-market transactions", async () => {
    const now = Date.now();
    await insertItemMarketTransactionsIgnoreConflicts(
      db,
      Array.from({ length: 10 }, (_, index) =>
        makeTx({
          id: `tx-${index}`,
          money: index + 1,
          createdAt: new Date(now - index * 60_000),
        }),
      ),
    );

    const res = await appFor(db).request("http://localhost/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ id: "chest", itemCode: "chest4", skills: { armor: 22 } }],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: Array<{
        id: string;
        median: string | null;
        trades: number;
        window: string;
        widened: boolean;
      }>;
      quotedAt: string;
    };
    expect(body.results).toEqual([
      { id: "chest", median: "5.5", trades: 10, window: "24h", widened: false },
    ]);
    expect(Number.isNaN(Date.parse(body.quotedAt))).toBe(false);
  });

  it("returns 400 for malformed quote bodies", async () => {
    const requests = [
      {},
      { items: Array.from({ length: 17 }, (_, index) => ({ id: `${index}`, itemCode: "chest4" })) },
      { items: [{ id: "", itemCode: "chest4" }] },
      { items: [{ id: "chest", itemCode: "" }] },
    ];

    for (const body of requests) {
      const res = await appFor(db).request("http://localhost/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(400);
    }
  });
});

describe("GET /import", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("soft-fails with an empty loadout when WarEra rejects", async () => {
    const res = await appFor(db, {
      request: async () => {
        throw new Error("inventory unavailable");
      },
    }).request("http://localhost/import?userId=user-1");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      slots: ReturnType<typeof emptyLoadout>;
      error: string | null;
      recordedAt: string;
    };
    expect(body.slots).toEqual(emptyLoadout());
    expect(body.error).toBe("inventory unavailable");
    expect(Number.isNaN(Date.parse(body.recordedAt))).toBe(false);
  });
});
