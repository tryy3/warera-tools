import { upsertAlliances } from "../../db/alliances";
import type { Db } from "../../db/client";
import type { Logger } from "../../logging/logger";
import { fetchAllAlliances } from "../../warera/alliances";
import type { WareraRequester } from "../../warera/prices";

export async function runAllianceSync(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
  now?: Date;
}): Promise<{ count: number }> {
  const now = options.now ?? new Date();
  const rows = await fetchAllAlliances(options.warera);
  const count = await upsertAlliances(options.db, rows, now);
  options.logger.info({ alliance_count: count }, "alliance sync complete");
  return { count };
}
