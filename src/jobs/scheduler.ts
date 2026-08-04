import { Cron } from "croner";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { jobs } from "../db/schema";
import type { Logger } from "../logging/logger";
import type { WareraRequester } from "../warera/prices";
import { listJobDefinitions } from "./registry";
import { resolveCron } from "./resolve-cron";
import { recordJobOverrun, runJob } from "./runner";
import type { JobDefinition } from "./types";

export type SchedulerHandle = {
  stop: () => void;
  reloadJob: (jobId: string) => Promise<void>;
};

/**
 * Starts Croner schedules for all enabled job definitions.
 * Awaits initial `scheduleOne` for every definition so boot is deterministic
 * (callers such as the server entry can rely on schedules being live before
 * accepting traffic).
 */
export async function startScheduler(deps: {
  db: Db;
  logger: Logger;
  warera: WareraRequester;
  jobRunHistoryLimit?: number;
}): Promise<SchedulerHandle> {
  const { db, logger, warera, jobRunHistoryLimit } = deps;
  const defs = new Map(listJobDefinitions().map((d) => [d.id, d]));
  const crons = new Map<string, Cron>();

  async function scheduleOne(def: JobDefinition): Promise<void> {
    const existing = crons.get(def.id);
    if (existing) {
      existing.stop();
      crons.delete(def.id);
    }

    const rows = await db.select().from(jobs).where(eq(jobs.id, def.id)).limit(1);
    const row = rows[0];
    if (!row || !row.enabled) {
      logger.info({ jobId: def.id }, "job not scheduled (missing or disabled)");
      return;
    }

    const cronExpr = resolveCron(row.cron, def.defaultCron, logger);
    const maxRuns = row.maxRuns ?? def.defaultMaxRuns ?? undefined;

    const protectCallback = () => {
      void recordJobOverrun(db, logger, def.id).catch((err) => {
        logger.error({ jobId: def.id }, "failed to record job overrun", err);
      });
    };

    const cronOpts: { protect: typeof protectCallback; name: string; maxRuns?: number } = {
      protect: protectCallback,
      name: def.id,
    };
    if (maxRuns != null && maxRuns > 0) {
      cronOpts.maxRuns = maxRuns;
    }

    const jobCron = new Cron(cronExpr, cronOpts, async () => {
      try {
        await runJob(db, logger, def, { keep: jobRunHistoryLimit, warera });
      } catch (err) {
        logger.error({ jobId: def.id }, "unhandled job error", err);
      }
    });
    crons.set(def.id, jobCron);
    logger.info({ jobId: def.id, cron: cronExpr, next: jobCron.nextRun() }, "job scheduled");
  }

  await Promise.all([...defs.values()].map((def) => scheduleOne(def)));

  return {
    stop() {
      for (const c of crons.values()) c.stop();
    },
    async reloadJob(jobId: string) {
      const def = defs.get(jobId);
      if (!def) {
        logger.warn({ jobId }, "reloadJob: unknown job");
        return;
      }
      await scheduleOne(def);
    },
  };
}
