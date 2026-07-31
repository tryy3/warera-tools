import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { setCached } from "../../db/cache";
import type { Db } from "../../db/client";
import * as schema from "../../db/schema";
import { HttpError } from "../errors";
import {
  SCRAPS_CACHE_KEY,
  SCRAPS_CACHE_TTL_SECONDS,
  type ScrapPricePayload,
  resolveScrapPrice,
} from "./scraps";

async function createMemoryDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  await client.execute(`
    CREATE TABLE cache (
      key TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      ttl_seconds INTEGER NOT NULL,
      tags TEXT
    )
  `);
  return drizzle(client, { schema });
}

describe("resolveScrapPrice", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createMemoryDb();
  });

  it("returns fresh cache without calling WarEra", async () => {
    const payload: ScrapPricePayload = {
      price: 0.215,
      fetchedAt: "2026-07-31T12:00:00.000Z",
    };
    await setCached(db, SCRAPS_CACHE_KEY, payload, SCRAPS_CACHE_TTL_SECONDS, "scraps");

    let calls = 0;
    const warera = {
      request: async <T>(_path: string): Promise<T> => {
        calls += 1;
        throw new Error("should not be called");
      },
    };

    const result = await resolveScrapPrice(db, warera, { force: false });
    expect(result).toEqual(payload);
    expect(calls).toBe(0);
  });

  it("fetches and caches on miss", async () => {
    const warera = {
      request: async <T>(_path: string): Promise<T> =>
        ({ result: { data: { scraps: 0.42 } } }) as T,
    };

    const result = await resolveScrapPrice(db, warera, { force: false });
    expect(result.price).toBe(0.42);
    expect(typeof result.fetchedAt).toBe("string");
    expect(result.stale).toBeUndefined();

    const cached = await resolveScrapPrice(db, warera, { force: false });
    expect(cached.price).toBe(0.42);
  });

  it("force bypasses fresh cache and refetches", async () => {
    await setCached(
      db,
      SCRAPS_CACHE_KEY,
      { price: 0.1, fetchedAt: "2026-07-31T10:00:00.000Z" },
      SCRAPS_CACHE_TTL_SECONDS,
      "scraps",
    );

    const warera = {
      request: async <T>(_path: string): Promise<T> =>
        ({ result: { data: { scraps: 0.99 } } }) as T,
    };

    const result = await resolveScrapPrice(db, warera, { force: true });
    expect(result.price).toBe(0.99);
  });

  it("returns stale payload when fetch fails but row exists", async () => {
    const payload: ScrapPricePayload = {
      price: 0.33,
      fetchedAt: "2026-07-30T12:00:00.000Z",
    };
    // TTL 0 → immediately stale for getCached, still present for getCachedRow
    await setCached(db, SCRAPS_CACHE_KEY, payload, 0, "scraps");

    const warera = {
      request: async <T>(_path: string): Promise<T> => {
        throw new Error("upstream down");
      },
    };

    const result = await resolveScrapPrice(db, warera, { force: false });
    expect(result).toEqual({ ...payload, stale: true });
  });

  it("throws HttpError 502 when fetch fails with empty cache", async () => {
    const warera = {
      request: async <T>(_path: string): Promise<T> => {
        throw new Error("upstream down");
      },
    };

    await expect(resolveScrapPrice(db, warera, { force: false })).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof HttpError && err.status === 502 && err.code === "upstream_error",
    );
  });
});
