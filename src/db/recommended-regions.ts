import { eq } from "drizzle-orm";
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

export async function getRecommendedRegion(
  db: Db,
  itemCode: string,
): Promise<RecommendedRegionRow | null> {
  const rows = await db
    .select()
    .from(recommendedRegions)
    .where(eq(recommendedRegions.itemCode, itemCode))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    itemCode: row.itemCode,
    regionId: row.regionId,
    regionName: row.regionName ?? null,
    bonus: row.bonus ?? null,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    fetchedAt: row.fetchedAt,
  };
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
