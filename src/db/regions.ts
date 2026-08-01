import { eq, inArray } from "drizzle-orm";
import type { Db } from "./client";
import { regions } from "./schema";

export type RegionRow = {
  id: string;
  name: string | null;
  countryCode: string | null;
  payload: Record<string, unknown> | null;
  fetchedAt: Date | null;
  enqueuedAt: Date;
};

function mapRow(row: typeof regions.$inferSelect): RegionRow {
  return {
    id: row.id,
    name: row.name ?? null,
    countryCode: row.countryCode ?? null,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    fetchedAt: row.fetchedAt ?? null,
    enqueuedAt: row.enqueuedAt,
  };
}

/** Batch insert-if-missing via ON CONFLICT DO NOTHING (single round-trip). */
export async function enqueueRegions(
  db: Db,
  regionIds: string[],
  now = new Date(),
): Promise<number> {
  const unique = [...new Set(regionIds.filter((id) => id.length > 0))];
  if (unique.length === 0) return 0;

  await db
    .insert(regions)
    .values(
      unique.map((id) => ({
        id,
        name: null,
        countryCode: null,
        payload: null,
        fetchedAt: null,
        enqueuedAt: now,
      })),
    )
    .onConflictDoNothing();
  return unique.length;
}

/** Insert-if-missing. Returns true when a new watchlist row was created. */
export async function enqueueRegion(db: Db, regionId: string, now = new Date()): Promise<boolean> {
  const before = await getRegion(db, regionId);
  if (before) return false;
  await enqueueRegions(db, [regionId], now);
  return true;
}

export async function getRegion(db: Db, regionId: string): Promise<RegionRow | null> {
  const rows = await db.select().from(regions).where(eq(regions.id, regionId)).limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Load many regions in one query. Empty input → no query. */
export async function getRegionsByIds(
  db: Db,
  regionIds: string[],
): Promise<Map<string, RegionRow>> {
  const unique = [...new Set(regionIds.filter((id) => id.length > 0))];
  const out = new Map<string, RegionRow>();
  if (unique.length === 0) return out;
  const rows = await db.select().from(regions).where(inArray(regions.id, unique));
  for (const row of rows) out.set(row.id, mapRow(row));
  return out;
}

export async function listRegionsForSync(db: Db): Promise<RegionRow[]> {
  const rows = await db.select().from(regions);
  return rows.map(mapRow).toSorted((a, b) => {
    if (a.fetchedAt == null && b.fetchedAt != null) return -1;
    if (a.fetchedAt != null && b.fetchedAt == null) return 1;
    if (a.fetchedAt == null && b.fetchedAt == null) {
      return a.enqueuedAt.getTime() - b.enqueuedAt.getTime();
    }
    return a.fetchedAt!.getTime() - b.fetchedAt!.getTime();
  });
}

export async function upsertRegionFetched(
  db: Db,
  row: {
    id: string;
    name: string | null;
    countryCode: string | null;
    payload?: Record<string, unknown> | null;
    fetchedAt: Date;
  },
): Promise<void> {
  await db
    .insert(regions)
    .values({
      id: row.id,
      name: row.name,
      countryCode: row.countryCode,
      payload: row.payload ?? null,
      fetchedAt: row.fetchedAt,
      enqueuedAt: row.fetchedAt,
    })
    .onConflictDoUpdate({
      target: regions.id,
      set: {
        name: row.name,
        countryCode: row.countryCode,
        payload: row.payload ?? null,
        fetchedAt: row.fetchedAt,
      },
    });
}
