import { upsertRecommendedRegion } from "../../db/recommended-regions";
import { enqueueRegion } from "../../db/regions";
import type { Db } from "../../db/client";
import { listProducibleRecipes } from "../../economy/recipes";
import type { Logger } from "../../logging/logger";
import { fetchBestRecommendedRegion } from "../../warera/companies";
import type { WareraRequester } from "../../warera/prices";

export async function runRecommendedRegionsPoll(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
}): Promise<{ itemCount: number; status: "success" | "partial" | "error"; errors: number }> {
  const { db, warera, logger } = options;
  const codes = listProducibleRecipes().map((r) => r.itemCode);
  let errors = 0;
  let itemCount = 0;
  const now = new Date();

  for (const itemCode of codes) {
    try {
      const region = await fetchBestRecommendedRegion(warera, itemCode);
      if (!region) {
        errors += 1;
        logger.warn({ itemCode }, "recommended region empty");
        continue;
      }
      await upsertRecommendedRegion(db, {
        itemCode,
        regionId: region.regionId,
        regionName: region.regionName,
        bonus: region.bonus,
        payload: {
          regionId: region.regionId,
          regionName: region.regionName,
          bonus: region.bonus,
        },
        fetchedAt: now,
      });
      await enqueueRegion(db, region.regionId, now);
      itemCount += 1;
    } catch (err) {
      errors += 1;
      logger.warn(
        { itemCode, err: err instanceof Error ? err.message : String(err) },
        "recommended region poll failed",
      );
    }
  }

  const status = itemCount === 0 && errors > 0 ? "error" : errors > 0 ? "partial" : "success";
  return { itemCount, status, errors };
}
