import { listRegionsForSync, upsertRegionFetched } from "../../db/regions";
import type { Db } from "../../db/client";
import type { Logger } from "../../logging/logger";
import { fetchRegionInfoOrThrow } from "../../warera/companies";
import type { WareraRequester } from "../../warera/prices";

export async function runRegionSync(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
}): Promise<{ regionCount: number; status: "success" | "partial" | "error"; errors: number }> {
  const { db, warera, logger } = options;
  const list = await listRegionsForSync(db);
  if (list.length === 0) return { regionCount: 0, status: "success", errors: 0 };

  let errors = 0;
  let regionCount = 0;
  const now = new Date();

  for (const row of list) {
    try {
      const info = await fetchRegionInfoOrThrow(warera, row.id);
      await upsertRegionFetched(db, {
        id: row.id,
        name: info.name,
        countryCode: info.countryCode,
        fetchedAt: now,
      });
      regionCount += 1;
    } catch (err) {
      errors += 1;
      logger.warn(
        { regionId: row.id, err: err instanceof Error ? err.message : String(err) },
        "region sync failed",
      );
    }
  }

  const status = regionCount === 0 && errors > 0 ? "error" : errors > 0 ? "partial" : "success";
  return { regionCount, status, errors };
}
