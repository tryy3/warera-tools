import type { Db } from "../db/client";
import { jobs } from "../db/schema";
import { countrySyncJob } from "./country-sync";
import { exampleHeartbeatJob } from "./example-heartbeat";
import { pricePollJob } from "./price-poll";
import type { JobDefinition } from "./types";

export function listJobDefinitions(): JobDefinition[] {
  return [exampleHeartbeatJob, pricePollJob, countrySyncJob];
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
      })
      .onConflictDoUpdate({
        target: jobs.id,
        set: {
          name: def.name,
          description: def.description,
        },
      });
  }
}
