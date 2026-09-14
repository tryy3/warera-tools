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
  isCommodityDeepenDone,
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

function makeCtx(
  db: Db,
  warera: JobContext["warera"],
  opts: { state?: Record<string, unknown> | null; setState?: JobContext["setState"] } = {},
): JobContext {
  return {
    db,
    logger: silentLogger,
    warera,
    state: opts.state ?? null,
    setState: opts.setState ?? (async () => {}),
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
    const ancientTrading = makeTx({
      id: "ancient-trading",
      transactionType: "trading",
      createdAt: new Date("2026-07-01T12:00:00.000Z"),
    });

    const tipPayload = {
      result: {
        data: {
          items: [toApiItem(fresh), toApiItem(known)],
          nextCursor: "should-not-follow",
        },
      },
    };
    const deepenPayload = {
      result: {
        data: {
          items: [toApiItem(ancientTrading)],
          nextCursor: null,
        },
      },
    };

    const request = vi
      .fn()
      .mockResolvedValueOnce(tipPayload) // itemMarket tip
      .mockResolvedValueOnce(tipPayload) // trading tip
      .mockResolvedValueOnce(deepenPayload); // trading deepen

    const msg = await runItemMarketTxPoll(makeCtx(db, { request }));
    expect(msg).toContain("itemMarket: 1 inserted, 1 pages (known_id)");
    expect(msg).toContain("trading: 0 inserted, 1 pages (known_id)");
    expect(msg).toContain("trading-deepen: 1 inserted, 1 pages (lookback)");
    expect(request).toHaveBeenCalledTimes(3);
    expect(isCommodityDeepenDone()).toBe(true);
    const urls = request.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("itemMarket"))).toBe(true);
    expect(urls.filter((u) => u.includes("trading")).length).toBe(2);

    const rows = await db.select().from(schema.itemMarketTransactions);
    expect(rows.map((r) => r.id).toSorted()).toEqual(["ancient-trading", "fresh", "known"]);
  });

  it("marks commodity deepen done after lookback stop", async () => {
    enableItemMarketTxPoll();
    const oldEnough = makeTx({
      id: "ancient",
      transactionType: "trading",
      createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    });
    const request = vi.fn().mockResolvedValue({
      result: {
        data: {
          items: [toApiItem(oldEnough)],
          nextCursor: null,
        },
      },
    });

    expect(isCommodityDeepenDone()).toBe(false);
    const msg = await runItemMarketTxPoll(makeCtx(db, { request }));
    expect(msg).toContain("trading-deepen:");
    expect(isCommodityDeepenDone()).toBe(true);

    const callsAfterFirst = request.mock.calls.length;
    await runItemMarketTxPoll(makeCtx(db, { request }));
    // Second run: tip polls only (no deepen)
    expect(request.mock.calls.length).toBe(callsAfterFirst + 2);
  });

  it("skips deepen when trading history already covers 30d", async () => {
    enableItemMarketTxPoll();
    await insertItemMarketTransactionsIgnoreConflicts(db, [
      makeTx({
        id: "already-old",
        transactionType: "trading",
        createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      }),
    ]);
    const tipPayload = {
      result: {
        data: {
          items: [
            toApiItem(
              makeTx({
                id: "already-old",
                transactionType: "trading",
                createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
              }),
            ),
          ],
          nextCursor: null,
        },
      },
    };
    const request = vi.fn().mockResolvedValue(tipPayload);
    const msg = await runItemMarketTxPoll(makeCtx(db, { request }));
    expect(msg).toContain("trading-deepen: skipped (already covers 30d)");
    expect(isCommodityDeepenDone()).toBe(true);
    // tip polls only (itemMarket + trading)
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("persists deepen resume cursor on page_budget", async () => {
    enableItemMarketTxPoll();
    const recent = makeTx({
      id: "recent",
      transactionType: "trading",
      createdAt: new Date(),
    });
    const tipStop = {
      result: {
        data: {
          items: [toApiItem(makeTx({ id: "tip-known" }))],
          nextCursor: null,
        },
      },
    };
    const deepenPage = {
      result: {
        data: {
          items: [toApiItem(recent)],
          nextCursor: "resume-me",
        },
      },
    };
    const request = vi.fn(async (url: string) => {
      if (String(url).includes("trading") && request.mock.calls.length > 2) {
        return deepenPage;
      }
      return tipStop;
    });

    const states: Array<Record<string, unknown> | null> = [];
    const setState = async (s: Record<string, unknown> | null) => {
      states.push(s);
    };

    const msg = await runItemMarketTxPoll(makeCtx(db, { request }, { setState }));
    expect(msg).toContain("trading-deepen:");
    expect(msg).toContain("page_budget");
    expect(isCommodityDeepenDone()).toBe(false);
    expect(states.at(-1)).toMatchObject({ tradingDeepenCursor: "resume-me" });
  });
});
