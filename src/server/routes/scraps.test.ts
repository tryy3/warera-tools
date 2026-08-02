import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { insertPricePoll, insertPriceSnapshots } from "../../db/prices";
import type { Db } from "../../db/client";
import * as schema from "../../db/schema";
import type { Logger } from "../../logging/logger";
import { HttpError } from "../errors";
import { resolveScrapPrice } from "./scraps";

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

async function createMemoryDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  await client.execute(`
    CREATE TABLE price_polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      recorded_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      item_count INTEGER DEFAULT 0 NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE price_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      poll_id INTEGER NOT NULL,
      item_code TEXT NOT NULL,
      market_price REAL,
      buy_min REAL,
      buy_max REAL,
      buy_avg REAL,
      sell_min REAL,
      sell_max REAL,
      sell_avg REAL,
      FOREIGN KEY (poll_id) REFERENCES price_polls(id)
    )
  `);
  return drizzle(client, { schema });
}

function mockWarera(scraps: number) {
  return {
    request: async <T>(path: string): Promise<T> => {
      if (path.startsWith("itemTrading.getPrices")) {
        return { result: { data: { scraps, steel: 1.5, concrete: 1.6, lead: 0.08 } } } as T;
      }
      if (path.startsWith("tradingOrder.getTopOrders")) {
        return {
          result: {
            data: {
              buyOrders: [{ price: 0.08 }],
              sellOrders: [{ price: 0.09 }],
            },
          },
        } as T;
      }
      throw new Error(`unexpected path ${path}`);
    },
  };
}

describe("resolveScrapPrice (history)", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createMemoryDb();
  });

  it("returns latest history without calling WarEra", async () => {
    const pollId = await insertPricePoll(db, {
      recordedAt: new Date("2026-07-31T12:00:00.000Z"),
      status: "success",
      itemCount: 1,
    });
    await insertPriceSnapshots(db, pollId, [
      {
        itemCode: "scraps",
        marketPrice: 0.215,
        buyMin: null,
        buyMax: null,
        buyAvg: null,
        sellMin: null,
        sellMax: null,
        sellAvg: null,
      },
    ]);

    let calls = 0;
    const warera = {
      request: async <T>(_path: string): Promise<T> => {
        calls += 1;
        throw new Error("should not be called");
      },
    };

    const result = await resolveScrapPrice(db, warera, silentLogger, { force: false });
    expect(result.price).toBe(0.215);
    expect(result.fetchedAt).toBe("2026-07-31T12:00:00.000Z");
    expect(calls).toBe(0);
  });

  it("polls on miss", async () => {
    const result = await resolveScrapPrice(db, mockWarera(0.42), silentLogger, {
      force: false,
    });
    expect(result.price).toBe(0.42);
    expect(result.stale).toBeUndefined();

    const cached = await resolveScrapPrice(db, mockWarera(0.99), silentLogger, {
      force: false,
    });
    expect(cached.price).toBe(0.42);
  });

  it("force runs a new poll", async () => {
    await resolveScrapPrice(db, mockWarera(0.1), silentLogger, { force: false });
    const result = await resolveScrapPrice(db, mockWarera(0.99), silentLogger, {
      force: true,
    });
    expect(result.price).toBe(0.99);
  });

  it("returns stale when poll fails but history exists", async () => {
    const pollId = await insertPricePoll(db, {
      recordedAt: new Date("2026-07-30T12:00:00.000Z"),
      status: "success",
      itemCount: 1,
    });
    await insertPriceSnapshots(db, pollId, [
      {
        itemCode: "scraps",
        marketPrice: 0.33,
        buyMin: null,
        buyMax: null,
        buyAvg: null,
        sellMin: null,
        sellMax: null,
        sellAvg: null,
      },
    ]);

    const warera = {
      request: async <T>(_path: string): Promise<T> => {
        throw new Error("upstream down");
      },
    };

    const result = await resolveScrapPrice(db, warera, silentLogger, { force: true });
    expect(result).toEqual({
      price: 0.33,
      fetchedAt: "2026-07-30T12:00:00.000Z",
      stale: true,
    });
  });

  it("throws HttpError 502 when poll fails with empty history", async () => {
    const warera = {
      request: async <T>(_path: string): Promise<T> => {
        throw new Error("upstream down");
      },
    };

    await expect(resolveScrapPrice(db, warera, silentLogger, { force: false })).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof HttpError && err.status === 502 && err.code === "upstream_error",
    );
  });
});
