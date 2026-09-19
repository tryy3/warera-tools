import { beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { ItemMarketTransaction } from "../warera/transactions";
import type { Db } from "./client";
import { createTestDb, truncateAllTables } from "./test/postgres";
import { insertItemMarketTransactionsIgnoreConflicts } from "./item-market-transactions";
import { listItemMarketTxForItemCodes, listItemMarketTxSince } from "./item-market-tx-read";

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

describe("listItemMarketTxSince", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("filters by since and optional itemCode", async () => {
    const t0 = new Date("2026-08-05T12:00:00.000Z");
    const t1 = new Date("2026-08-05T18:00:00.000Z");
    await insertItemMarketTransactionsIgnoreConflicts(db, [
      makeTx({ id: "a", itemCode: "chest4", money: 40, createdAt: t0 }),
      makeTx({ id: "b", itemCode: "chest4", money: 50, createdAt: t1 }),
      makeTx({ id: "c", itemCode: "helmet4", money: 30, createdAt: t1 }),
    ]);
    const since = new Date("2026-08-05T15:00:00.000Z");
    const all = await listItemMarketTxSince(db, since);
    expect(all.map((r) => r.id).sort()).toEqual(["b", "c"]);
    const chest = await listItemMarketTxSince(db, since, "chest4");
    expect(chest.map((r) => r.id)).toEqual(["b"]);
  });
});

describe("listItemMarketTxForItemCodes", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("returns empty array for empty itemCodes", async () => {
    await insertItemMarketTransactionsIgnoreConflicts(db, [
      makeTx({ id: "a", itemCode: "chest4" }),
    ]);
    expect(await listItemMarketTxForItemCodes(db, [])).toEqual([]);
  });

  it("returns txs only for requested item codes", async () => {
    await insertItemMarketTransactionsIgnoreConflicts(db, [
      makeTx({ id: "a", itemCode: "chest4", money: 40 }),
      makeTx({ id: "b", itemCode: "helmet4", money: 30 }),
      makeTx({ id: "c", itemCode: "boots4", money: 20 }),
    ]);
    const rows = await listItemMarketTxForItemCodes(db, ["chest4", "helmet4"]);
    expect(rows.map((r) => r.id).sort()).toEqual(["a", "b"]);
    expect(rows.every((r) => r.itemCode === "chest4" || r.itemCode === "helmet4")).toBe(true);
  });
});
