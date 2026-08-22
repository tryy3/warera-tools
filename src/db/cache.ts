import { eq } from "drizzle-orm";
import { count } from "../metrics";
import type { Db } from "./client";
import { cache } from "./schema";

export function isCacheFresh(fetchedAt: Date, ttlSeconds: number, now = new Date()): boolean {
  return now.getTime() < fetchedAt.getTime() + ttlSeconds * 1000;
}

export function classifyCacheLookup(
  row: { fetchedAt: Date; ttlSeconds: number } | null,
  now: Date,
): "hit" | "miss" | "stale" {
  if (!row) return "miss";
  if (!isCacheFresh(row.fetchedAt, row.ttlSeconds, now)) return "stale";
  return "hit";
}

export function recordCacheLookup(cache_kind: string, result: "hit" | "miss" | "stale"): void {
  count("cache.l1.lookup", 1, { cache_kind, result });
}

export async function getCachedRow<T>(
  db: Db,
  key: string,
): Promise<{ payload: T; fetchedAt: Date; ttlSeconds: number } | null> {
  const rows = await db.select().from(cache).where(eq(cache.key, key)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    payload: row.payload as T,
    fetchedAt: row.fetchedAt as Date,
    ttlSeconds: row.ttlSeconds,
  };
}

export async function getCached<T>(db: Db, key: string): Promise<T | null> {
  const row = await getCachedRow<T>(db, key);
  const result = classifyCacheLookup(row, new Date());
  recordCacheLookup("kv", result);
  if (result !== "hit" || !row) return null;
  return row.payload;
}

export async function setCached(
  db: Db,
  key: string,
  payload: unknown,
  ttlSeconds: number,
  tags?: string,
): Promise<void> {
  await db
    .insert(cache)
    .values({
      key,
      payload,
      fetchedAt: new Date(),
      ttlSeconds,
      tags: tags ?? null,
    })
    .onConflictDoUpdate({
      target: cache.key,
      set: {
        payload,
        fetchedAt: new Date(),
        ttlSeconds,
        tags: tags ?? null,
      },
    });
}

export async function getOrFetch<T>(
  db: Db,
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
  tags?: string,
): Promise<T> {
  const hit = await getCached<T>(db, key);
  if (hit !== null) return hit;
  const value = await fetcher();
  await setCached(db, key, value, ttlSeconds, tags);
  return value;
}
