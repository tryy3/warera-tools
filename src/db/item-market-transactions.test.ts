import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { ItemMarketTransaction } from "../warera/transactions";
import type { Db } from "./client";
import {
  findExistingItemMarketTransactionIds,
  insertItemMarketTransactionsIgnoreConflicts,
} from "./item-market-transactions";
import * as schema from "./schema";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "item-market-tx-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE item_market_transactions (
      id text PRIMARY KEY NOT NULL,
      money real NOT NULL,
      item_code text NOT NULL,
      quantity integer NOT NULL,
      seller_id text NOT NULL,
      buyer_id text NOT NULL,
      transaction_type text NOT NULL,
      item_id text NOT NULL,
      item_type text,
      item_state integer,
      item_max_state integer,
      item_quantity integer,
      item_last_acquisition_at integer,
      skills text,
      offer_created_at integer,
      created_at integer NOT NULL,
      updated_at integer,
      payload text,
      ingested_at integer NOT NULL
    )
  `);
  await client.execute(`
    CREATE INDEX item_market_tx_item_code_created_at_idx
    ON item_market_transactions (item_code, created_at)
  `);
  await client.execute(`
    CREATE INDEX item_market_tx_created_at_idx
    ON item_market_transactions (created_at)
  `);
  return drizzle(client, { schema });
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
    createdAt: new Date("2026-08-04T15:58:05.369Z"),
    updatedAt: new Date("2026-08-04T15:58:05.369Z"),
    payload: { __v: 0 },
    ...overrides,
  };
}

describe("item-market-transactions db", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
  });

  it("inserts once and reports existing ids on conflict", async () => {
    const tx = makeTx();
    const first = await insertItemMarketTransactionsIgnoreConflicts(db, [tx]);
    expect(first).toEqual({ inserted: 1, existingIds: [] });

    const second = await insertItemMarketTransactionsIgnoreConflicts(db, [tx]);
    expect(second.inserted).toBe(0);
    expect(second.existingIds).toContain("tx1");

    const rows = await db.select().from(schema.itemMarketTransactions);
    expect(rows).toHaveLength(1);
  });

  it("round-trips skills JSON", async () => {
    const skills = { armor: 22, crit: 3 };
    await insertItemMarketTransactionsIgnoreConflicts(db, [makeTx({ skills })]);
    const rows = await db.select().from(schema.itemMarketTransactions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.skills).toEqual(skills);
  });

  it("findExistingItemMarketTransactionIds returns only known ids", async () => {
    await insertItemMarketTransactionsIgnoreConflicts(db, [
      makeTx({ id: "a" }),
      makeTx({ id: "b" }),
    ]);
    const found = await findExistingItemMarketTransactionIds(db, ["a", "c", "b"]);
    expect(found).toEqual(new Set(["a", "b"]));
  });

  it("no-ops on empty insert and empty id lookup", async () => {
    expect(await insertItemMarketTransactionsIgnoreConflicts(db, [])).toEqual({
      inserted: 0,
      existingIds: [],
    });
    expect(await findExistingItemMarketTransactionIds(db, [])).toEqual(new Set());
  });
});
