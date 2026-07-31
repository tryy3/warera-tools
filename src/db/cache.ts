import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { cache } from "./schema";

export function isCacheFresh(fetchedAt: Date, ttlSeconds: number, now = new Date()): boolean {
  return now.getTime() < fetchedAt.getTime() + ttlSeconds * 1000;
}

export async function getCached<T>(db: Db, key: string): Promise<T | null> {
  const rows = await db.select().from(cache).where(eq(cache.key, key)).limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!isCacheFresh(row.fetchedAt as Date, row.ttlSeconds)) return null;
  return row.payload as T;
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
