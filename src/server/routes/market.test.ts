import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "../../db/client";
import { createTestDb, truncateAllTables } from "../../db/test/postgres";
import { insertItemMarketTransactionsIgnoreConflicts } from "../../db/item-market-transactions";
import type { ItemMarketTransaction } from "../../warera/transactions";
import { errorPayload } from "../errors";
import { marketRoutes } from "./market";

function makeTx(overrides: Partial<ItemMarketTransaction> = {}): ItemMarketTransaction {
  return {
    id: "tx1",
    money: 10,
    itemCode: "steel",
    quantity: 1,
    sellerId: "seller1",
    buyerId: "buyer1",
    transactionType: "trading",
    itemId: "item1",
    itemType: null,
    itemState: null,
    itemMaxState: null,
    itemQuantity: null,
    itemLastAcquisitionAt: null,
    skills: null,
    offerCreatedAt: null,
    createdAt: new Date("2026-09-10T12:00:00.000Z"),
    updatedAt: null,
    payload: {},
    ...overrides,
  };
}

function appFor(db: Db) {
  const app = new Hono();
  app.onError((err, c) => {
    const { status, body } = errorPayload(err);
    return c.json(body, status as ContentfulStatusCode);
  });
  app.route("/", marketRoutes({ db }));
  return app;
}

type MyTradesBody = {
  itemCode: string;
  playerId: string;
  range: string;
  chunks: Array<{
    side: "buy" | "sell";
    unitPrice: number;
    totalQty: number;
    totalMoney: number;
    startAt: string;
    endAt: string;
    fillCount: number;
  }>;
  realized: { pnl: number | null; sellQty: number; buyQty: number };
  historyIncomplete: boolean;
  fillCount: number;
};

describe("GET /:itemCode/my-trades", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("400s when playerId is missing", async () => {
    const res = await appFor(db).request("http://localhost/steel/my-trades?range=7d");
    expect(res.status).toBe(400);
  });

  it("400s when playerId is blank", async () => {
    const res = await appFor(db).request("http://localhost/steel/my-trades?playerId=%20&range=7d");
    expect(res.status).toBe(400);
  });

  it("returns empty chunks when player has no fills", async () => {
    const res = await appFor(db).request(
      "http://localhost/steel/my-trades?playerId=player1&range=7d",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as MyTradesBody;
    expect(body).toMatchObject({
      itemCode: "steel",
      playerId: "player1",
      range: "7d",
      chunks: [],
      realized: { pnl: 0, sellQty: 0, buyQty: 0 },
      historyIncomplete: false,
      fillCount: 0,
    });
  });

  it("returns chunk and realized pnl for buy then sell in range", async () => {
    const playerId = "player1";
    const now = Date.now();
    const buyAt = new Date(now - 2 * 60 * 60 * 1000);
    const sellAt = new Date(now - 1 * 60 * 60 * 1000);

    await insertItemMarketTransactionsIgnoreConflicts(db, [
      makeTx({
        id: "buy1",
        itemCode: "steel",
        buyerId: playerId,
        sellerId: "other-seller",
        money: 100,
        quantity: 10,
        createdAt: buyAt,
      }),
      makeTx({
        id: "sell1",
        itemCode: "steel",
        buyerId: "other-buyer",
        sellerId: playerId,
        money: 150,
        quantity: 10,
        createdAt: sellAt,
      }),
    ]);

    const res = await appFor(db).request(
      `http://localhost/steel/my-trades?playerId=${playerId}&range=7d`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as MyTradesBody;

    expect(body.itemCode).toBe("steel");
    expect(body.playerId).toBe(playerId);
    expect(body.range).toBe("7d");
    expect(body.fillCount).toBe(2);
    expect(body.historyIncomplete).toBe(false);
    expect(body.realized).toEqual({ pnl: 50, sellQty: 10, buyQty: 10 });

    expect(body.chunks).toHaveLength(2);
    expect(body.chunks[0]).toMatchObject({
      side: "buy",
      unitPrice: 10,
      totalQty: 10,
      totalMoney: 100,
      fillCount: 1,
      startAt: buyAt.toISOString(),
      endAt: buyAt.toISOString(),
    });
    expect(body.chunks[1]).toMatchObject({
      side: "sell",
      unitPrice: 15,
      totalQty: 10,
      totalMoney: 150,
      fillCount: 1,
      startAt: sellAt.toISOString(),
      endAt: sellAt.toISOString(),
    });
  });
});
