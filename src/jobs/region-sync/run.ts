import { listRegionsForSync, upsertRegionsFetched } from "../../db/regions";
import type { Db } from "../../db/client";
import type { Logger } from "../../logging/logger";
import { fetchRegionInfoOrThrow } from "../../warera/companies";
import type { WareraRequester } from "../../warera/prices";

export async function runRegionSync(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
  now?: Date;
}): Promise<{ regionCount: number; status: "success" | "partial" | "error"; errors: number }> {
  const { db, warera, logger } = options;
  const now = options.now ?? new Date();
  const list = await listRegionsForSync(db, { now });
  if (list.length === 0) return { regionCount: 0, status: "success", errors: 0 };

  let errors = 0;
  let regionCount = 0;
  const pending: Array<{
    id: string;
    name: string | null;
    countryCode: string | null;
    fetchedAt: Date;
  }> = [];

  for (const row of list) {
    try {
      const info = await fetchRegionInfoOrThrow(warera, row.id);
      pending.push({
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

  await upsertRegionsFetched(db, pending);

  const status = regionCount === 0 && errors > 0 ? "error" : errors > 0 ? "partial" : "success";
  return { regionCount, status, errors };
}
