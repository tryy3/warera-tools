import { eq, inArray } from "drizzle-orm";
import type { Db } from "./client";
import { recommendedRegions } from "./schema";

export type RecommendedRegionRow = {
  itemCode: string;
  regionId: string;
  regionName: string | null;
  bonus: number | null;
  payload: Record<string, unknown> | null;
  fetchedAt: Date;
};

function mapRow(row: typeof recommendedRegions.$inferSelect): RecommendedRegionRow {
  return {
    itemCode: row.itemCode,
    regionId: row.regionId,
    regionName: row.regionName ?? null,
    bonus: row.bonus ?? null,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    fetchedAt: row.fetchedAt,
  };
}

export async function getRecommendedRegion(
  db: Db,
  itemCode: string,
): Promise<RecommendedRegionRow | null> {
  const rows = await db
    .select()
    .from(recommendedRegions)
    .where(eq(recommendedRegions.itemCode, itemCode))
    .limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Load many recommended regions in one query. Empty input → no query. */
export async function getRecommendedRegionsByItemCodes(
  db: Db,
  itemCodes: string[],
): Promise<Map<string, RecommendedRegionRow>> {
  const unique = [...new Set(itemCodes.filter((c) => c.length > 0))];
  const out = new Map<string, RecommendedRegionRow>();
  if (unique.length === 0) return out;
  const rows = await db
    .select()
    .from(recommendedRegions)
    .where(inArray(recommendedRegions.itemCode, unique));
  for (const row of rows) out.set(row.itemCode, mapRow(row));
  return out;
}

export async function upsertRecommendedRegion(
  db: Db,
  row: {
    itemCode: string;
    regionId: string;
    regionName: string | null;
    bonus: number | null;
    payload: Record<string, unknown> | null;
    fetchedAt: Date;
  },
): Promise<void> {
  await db
    .insert(recommendedRegions)
    .values({
      itemCode: row.itemCode,
      regionId: row.regionId,
      regionName: row.regionName,
      bonus: row.bonus,
      payload: row.payload,
      fetchedAt: row.fetchedAt,
    })
    .onConflictDoUpdate({
      target: recommendedRegions.itemCode,
      set: {
        regionId: row.regionId,
        regionName: row.regionName,
        bonus: row.bonus,
        payload: row.payload,
        fetchedAt: row.fetchedAt,
      },
    });
}
