import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { insertPricePoll, insertPriceSnapshots } from "../../db/prices";
import type { Db } from "../../db/client";
import * as schema from "../../db/schema";
import type { Logger } from "../../logging/logger";
import { errorPayload } from "../errors";
import { pricesRoutes } from "./prices";

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

function appFor(db: Db) {
  const app = new Hono();
  app.onError((err, c) => {
    const { status, body } = errorPayload(err);
    return c.json(body, status as ContentfulStatusCode);
  });
  app.route(
    "/",
    pricesRoutes({
      db,
      warera: {
        request: async () => {
          throw new Error("unused");
        },
      },
      logger: silentLogger,
    }),
  );
  return app;
}

describe("GET /history", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createMemoryDb();
  });

  it("returns history for an item", async () => {
    const recordedAt = new Date("2026-08-01T12:00:00.000Z");
    const pollId = await insertPricePoll(db, {
      recordedAt,
      status: "success",
      itemCount: 1,
    });
    await insertPriceSnapshots(db, pollId, [
      {
        itemCode: "steel",
        marketPrice: 1.6,
        buyMin: 1.5,
        buyMax: 1.5,
        buyAvg: 1.5,
        sellMin: 1.7,
        sellMax: 1.7,
        sellAvg: 1.7,
      },
    ]);

    const res = await appFor(db).request("http://localhost/history?itemCode=steel&range=7d");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      itemCode: string;
      range: string;
      latest: { marketPrice: number; topBuy: number; topSell: number };
      points: unknown[];
    };
    expect(body.itemCode).toBe("steel");
    expect(body.range).toBe("7d");
    expect(body.latest.marketPrice).toBe(1.6);
    expect(body.latest.topBuy).toBe(1.5);
    expect(body.latest.topSell).toBe(1.7);
    expect(body.points).toHaveLength(1);
  });

  it("coerces bad range to 7d", async () => {
    const pollId = await insertPricePoll(db, {
      recordedAt: new Date(),
      status: "success",
      itemCount: 1,
    });
    await insertPriceSnapshots(db, pollId, [
      {
        itemCode: "steel",
        marketPrice: 1,
        buyMin: null,
        buyMax: null,
        buyAvg: null,
        sellMin: null,
        sellMax: null,
        sellAvg: null,
      },
    ]);
    const res = await appFor(db).request("http://localhost/history?itemCode=steel&range=nope");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { range: string }).range).toBe("7d");
  });

  it("404s for unknown item", async () => {
    const res = await appFor(db).request("http://localhost/history?itemCode=missing&range=7d");
    expect(res.status).toBe(404);
  });

  it("400s without itemCode", async () => {
    const res = await appFor(db).request("http://localhost/history?range=7d");
    expect(res.status).toBe(400);
  });
});
