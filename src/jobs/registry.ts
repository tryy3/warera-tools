import type { Db } from "../db/client";
import { jobs } from "../db/schema";
import { battleInfoPollJob } from "./battle-info-poll";
import { countrySyncJob } from "./country-sync";
import { exampleHeartbeatJob } from "./example-heartbeat";
import { itemMarketTxBackfillJob } from "./item-market-tx-backfill";
import { itemMarketTxPollJob } from "./item-market-tx-poll";
import { muStatsPollJob } from "./mu-stats-poll";
import { pricePollJob } from "./price-poll";
import { recommendedRegionsPollJob } from "./recommended-regions-poll";
import { regionSyncJob } from "./region-sync";
import { workStatsPollJob } from "./work-stats-poll";
import type { JobDefinition } from "./types";

export function listJobDefinitions(): JobDefinition[] {
  return [
    exampleHeartbeatJob,
    pricePollJob,
    countrySyncJob,
    recommendedRegionsPollJob,
    regionSyncJob,
    muStatsPollJob,
    battleInfoPollJob,
    workStatsPollJob,
    itemMarketTxBackfillJob,
    itemMarketTxPollJob,
  ];
}

export async function syncJobsToDb(db: Db, defs: JobDefinition[]): Promise<void> {
  for (const def of defs) {
    await db
      .insert(jobs)
      .values({
        id: def.id,
        name: def.name,
        description: def.description,
        cron: def.defaultCron,
        enabled: def.defaultEnabled ?? true,
        maxRuns: def.defaultMaxRuns ?? null,
      })
      .onConflictDoUpdate({
        target: jobs.id,
        set: {
          name: def.name,
          description: def.description,
          // do not overwrite cron, enabled, or maxRuns
        },
      });
  }
}
