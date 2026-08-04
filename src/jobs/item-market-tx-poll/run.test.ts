import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import { insertItemMarketTransactionsIgnoreConflicts } from "../../db/item-market-transactions";
import * as schema from "../../db/schema";
import type { Logger } from "../../logging/logger";
import type { ItemMarketTransaction } from "../../warera/transactions";
import {
  enableItemMarketTxPoll,
  resetItemMarketTxHandoffForTests,
} from "../item-market-tx/handoff";
import type { JobContext } from "../types";
import { runItemMarketTxPoll } from "./run";

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

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "item-market-poll-"));
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
  return drizzle(client, { schema });
}

function makeTx(overrides: Partial<ItemMarketTransaction> = {}): ItemMarketTransaction {
  return {
    id: "tx1",
    money: 10,
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
    itemLastAcquisitionAt: null,
    skills: null,
    offerCreatedAt: null,
    createdAt: new Date("2026-08-04T12:00:00.000Z"),
    updatedAt: null,
    payload: null,
    ...overrides,
  };
}

function makeCtx(db: Db, warera: JobContext["warera"]): JobContext {
  return {
    db,
    logger: silentLogger,
    warera,
    state: null,
    setState: async () => {},
  };
}

function toApiItem(tx: ItemMarketTransaction) {
  return {
    _id: tx.id,
    money: tx.money,
    itemCode: tx.itemCode,
    quantity: tx.quantity,
    sellerId: tx.sellerId,
    buyerId: tx.buyerId,
    transactionType: tx.transactionType,
    item: {
      _id: tx.itemId,
      type: tx.itemType,
      state: tx.itemState,
      maxState: tx.itemMaxState,
      quantity: tx.itemQuantity,
      skills: tx.skills,
    },
    createdAt: tx.createdAt.toISOString(),
  };
}

describe("runItemMarketTxPoll", () => {
  let db: Db;

  beforeEach(async () => {
    resetItemMarketTxHandoffForTests();
    db = await createDb();
  });

  it("waits for handoff without calling WarEra", async () => {
    const request = vi.fn();
    const msg = await runItemMarketTxPoll(makeCtx(db, { request }));
    expect(msg).toBe("waiting for backfill handoff");
    expect(request).not.toHaveBeenCalled();
  });

  it("with handoff inserts new txs and stops on known id", async () => {
    await insertItemMarketTransactionsIgnoreConflicts(db, [
      makeTx({ id: "known", createdAt: new Date("2026-08-04T16:00:00.000Z") }),
    ]);
    enableItemMarketTxPoll();

    const fresh = makeTx({
      id: "fresh",
      createdAt: new Date("2026-08-04T17:00:00.000Z"),
    });
    const known = makeTx({
      id: "known",
      createdAt: new Date("2026-08-04T16:00:00.000Z"),
    });

    const request = vi.fn().mockResolvedValue({
      result: {
        data: {
          items: [toApiItem(fresh), toApiItem(known)],
          nextCursor: "should-not-follow",
        },
      },
    });

    const msg = await runItemMarketTxPoll(makeCtx(db, { request }));
    expect(msg).toBe("poll: 1 inserted, 1 pages (known_id)");
    expect(request).toHaveBeenCalledTimes(1);

    const rows = await db.select().from(schema.itemMarketTransactions);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id).toSorted()).toEqual(["fresh", "known"]);
  });
});
