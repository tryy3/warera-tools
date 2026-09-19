import { beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { ItemMarketTransaction } from "../warera/transactions";
import type { Db } from "./client";
import { createTestDb, truncateAllTables } from "./test/postgres";
import { insertItemMarketTransactionsIgnoreConflicts } from "./item-market-transactions";
import { listPlayerItemFills } from "./item-market-tx-player";

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
    createdAt: new Date("2026-08-04T15:58:05.369Z"),
    updatedAt: new Date("2026-08-04T15:58:05.369Z"),
    payload: { __v: 0 },
    ...overrides,
  };
}

function sideForPlayer(
  row: { buyerId: string; sellerId: string },
  playerId: string,
): "buy" | "sell" {
  return row.buyerId === playerId ? "buy" : "sell";
}

describe("listPlayerItemFills", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("returns buy and sell fills for player+item ordered by createdAt", async () => {
    const playerId = "player1";
    const t0 = new Date("2026-09-01T10:00:00.000Z");
    const t1 = new Date("2026-09-02T10:00:00.000Z");
    const t2 = new Date("2026-09-03T10:00:00.000Z");

    await insertItemMarketTransactionsIgnoreConflicts(db, [
      makeTx({
        id: "buy1",
        itemCode: "chest4",
        buyerId: playerId,
        sellerId: "other-seller",
        money: 100,
        quantity: 2,
        createdAt: t0,
      }),
      makeTx({
        id: "sell1",
        itemCode: "chest4",
        buyerId: "other-buyer",
        sellerId: playerId,
        money: 60,
        quantity: 1,
        createdAt: t1,
      }),
      makeTx({
        id: "other-item",
        itemCode: "helmet4",
        buyerId: playerId,
        sellerId: "other-seller",
        money: 10,
        quantity: 1,
        createdAt: t1,
      }),
      makeTx({
        id: "unrelated",
        itemCode: "chest4",
        buyerId: "a",
        sellerId: "b",
        money: 5,
        quantity: 1,
        createdAt: t2,
      }),
    ]);

    const rows = await listPlayerItemFills(db, {
      playerId,
      itemCode: "chest4",
    });

    expect(rows.map((r) => r.id)).toEqual(["buy1", "sell1"]);
    expect(sideForPlayer(rows[0]!, playerId)).toBe("buy");
    expect(sideForPlayer(rows[1]!, playerId)).toBe("sell");
    expect(rows[0]).toMatchObject({
      money: 100,
      quantity: 2,
      buyerId: playerId,
      sellerId: "other-seller",
      createdAt: t0,
    });
    expect(rows[1]).toMatchObject({
      money: 60,
      quantity: 1,
      buyerId: "other-buyer",
      sellerId: playerId,
      createdAt: t1,
    });
  });
});
