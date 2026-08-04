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
import type { ItemMarketTransaction, ItemMarketTransactionsPage } from "../../warera/transactions";
import {
  isItemMarketTxPollEnabled,
  resetItemMarketTxHandoffForTests,
} from "./handoff";
import { walkItemMarketTransactions } from "./ingest";

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
  const dir = mkdtempSync(join(tmpdir(), "item-market-ingest-"));
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

describe("walkItemMarketTransactions", () => {
  let db: Db;

  beforeEach(async () => {
    resetItemMarketTxHandoffForTests();
    db = await createDb();
  });

  it("backfill enables handoff after first successful page even if later stop", async () => {
    const now = new Date("2026-08-04T18:00:00.000Z");
    const fetchPage = vi.fn(async (): Promise<ItemMarketTransactionsPage> => ({
      items: [makeTx({ id: "fresh", createdAt: new Date("2026-08-04T17:00:00.000Z") })],
      nextCursor: null,
    }));

    expect(isItemMarketTxPollEnabled()).toBe(false);

    const result = await walkItemMarketTransactions({
      db,
      logger: silentLogger,
      mode: "backfill",
      fetchPage,
      pageDelayMs: 0,
      now,
    });

    expect(isItemMarketTxPollEnabled()).toBe(true);
    expect(result.pages).toBe(1);
    expect(result.inserted).toBe(1);
    expect(result.stoppedReason).toBe("no_cursor");
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("mid-page known id stops and does not request next cursor", async () => {
    await insertItemMarketTransactionsIgnoreConflicts(db, [
      makeTx({ id: "known", createdAt: new Date("2026-08-04T16:00:00.000Z") }),
    ]);

    const fetchPage = vi.fn(async (opts: { cursor?: string; perPage?: number }) => {
      if (opts.cursor) {
        throw new Error("should not request next cursor");
      }
      return {
        items: [
          makeTx({ id: "new", createdAt: new Date("2026-08-04T17:00:00.000Z") }),
          makeTx({ id: "known", createdAt: new Date("2026-08-04T16:00:00.000Z") }),
        ],
        nextCursor: "next-page",
      } satisfies ItemMarketTransactionsPage;
    });

    const result = await walkItemMarketTransactions({
      db,
      logger: silentLogger,
      mode: "backfill",
      fetchPage,
      pageDelayMs: 0,
      now: new Date("2026-08-04T18:00:00.000Z"),
    });

    expect(result.stoppedReason).toBe("known_id");
    expect(result.inserted).toBe(1);
    expect(result.pages).toBe(1);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(isItemMarketTxPollEnabled()).toBe(true);
  });

  it("backfill 24h cutoff stops without requiring known id", async () => {
    const now = new Date("2026-08-04T18:00:00.000Z");
    const fetchPage = vi.fn(async (): Promise<ItemMarketTransactionsPage> => ({
      items: [
        makeTx({
          id: "old-a",
          createdAt: new Date("2026-08-03T17:00:00.000Z"), // 25h ago
        }),
        makeTx({
          id: "old-b",
          createdAt: new Date("2026-08-03T16:00:00.000Z"), // 26h ago
        }),
      ],
      nextCursor: "would-continue",
    }));

    const result = await walkItemMarketTransactions({
      db,
      logger: silentLogger,
      mode: "backfill",
      fetchPage,
      pageDelayMs: 0,
      lookbackMs: 24 * 60 * 60 * 1000,
      now,
    });

    expect(result.stoppedReason).toBe("lookback");
    expect(result.inserted).toBe(2);
    expect(result.pages).toBe(1);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(isItemMarketTxPollEnabled()).toBe(true);
  });

  it("poll does not enable handoff", async () => {
    const fetchPage = vi.fn(async (): Promise<ItemMarketTransactionsPage> => ({
      items: [makeTx({ id: "poll-tx" })],
      nextCursor: null,
    }));

    expect(isItemMarketTxPollEnabled()).toBe(false);

    const result = await walkItemMarketTransactions({
      db,
      logger: silentLogger,
      mode: "poll",
      fetchPage,
      now: new Date("2026-08-04T18:00:00.000Z"),
    });

    expect(isItemMarketTxPollEnabled()).toBe(false);
    expect(result.pages).toBe(1);
    expect(result.inserted).toBe(1);
    expect(result.stoppedReason).toBe("no_cursor");
  });
});
