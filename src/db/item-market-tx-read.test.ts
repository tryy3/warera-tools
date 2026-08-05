import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { ItemMarketTransaction } from "../warera/transactions";
import type { Db } from "./client";
import { insertItemMarketTransactionsIgnoreConflicts } from "./item-market-transactions";
import { listItemMarketTxSince } from "./item-market-tx-read";
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

describe("listItemMarketTxSince", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createDb();
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
