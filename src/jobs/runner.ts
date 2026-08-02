import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { jobRuns, jobs } from "../db/schema";
import type { Logger } from "../logging/logger";
import type { WareraRequester } from "../warera/prices";
import { pruneJobRuns } from "./prune";
import type { JobDefinition } from "./types";

const STALE_RUNNING_MS = 30 * 60 * 1000;
const DEFAULT_JOB_RUN_HISTORY_LIMIT = 50;
export const INTERRUPTED_MESSAGE = "interrupted/stale";
const SKIP_ALREADY_RUNNING = "job already running";

export type RunJobResult = {
  started: boolean;
  skippedReason?: string;
};

export type RunJobOptions = {
  force?: boolean;
  keep?: number;
  warera: WareraRequester;
};

/** In-process guard so cron + POST /run cannot double-start the same job. */
const inflightJobs = new Set<string>();

export function isStaleRunning(lastStartedAt: Date | null | undefined, now: Date): boolean {
  if (!lastStartedAt) return true;
  return now.getTime() - lastStartedAt.getTime() > STALE_RUNNING_MS;
}

async function markOpenRunsInterrupted(
  db: Db,
  jobId: string,
  now: Date,
  message: string = INTERRUPTED_MESSAGE,
): Promise<void> {
  const openRuns = await db
    .select()
    .from(jobRuns)
    .where(and(eq(jobRuns.jobId, jobId), eq(jobRuns.status, "running")));

  for (const run of openRuns) {
    const startedAt = run.startedAt as Date;
    const durationMs = Math.max(0, now.getTime() - startedAt.getTime());
    await db
      .update(jobRuns)
      .set({
        finishedAt: now,
        status: "error",
        message,
        durationMs,
      })
      .where(eq(jobRuns.id, run.id));
  }
}

/**
 * Clears jobs left in `running` after a process crash/restart so they are not
 * locked out until the stale timeout.
 */
export async function reconcileInterruptedRuns(db: Db, logger: Logger): Promise<void> {
  const now = new Date();
  const interrupted = await db.select().from(jobs).where(eq(jobs.lastStatus, "running"));

  for (const job of interrupted) {
    await markOpenRunsInterrupted(db, job.id, now);
    await db
      .update(jobs)
      .set({
        lastFinishedAt: now,
        lastStatus: "error",
        lastError: INTERRUPTED_MESSAGE,
      })
      .where(eq(jobs.id, job.id));
    logger.warn({ jobId: job.id }, "reconciled interrupted job run");
  }
}

export async function runJob(
  db: Db,
  logger: Logger,
  def: JobDefinition,
  opts: RunJobOptions,
): Promise<RunJobResult> {
  if (inflightJobs.has(def.id)) {
    logger.info({ jobId: def.id }, "job already running in-process; skip");
    return { started: false, skippedReason: SKIP_ALREADY_RUNNING };
  }

  inflightJobs.add(def.id);
  try {
    return await runJobLocked(db, logger, def, opts);
  } finally {
    inflightJobs.delete(def.id);
  }
}

async function runJobLocked(
  db: Db,
  logger: Logger,
  def: JobDefinition,
  opts: RunJobOptions,
): Promise<RunJobResult> {
  const keep = opts.keep ?? DEFAULT_JOB_RUN_HISTORY_LIMIT;
  const now = new Date();
  const rows = await db.select().from(jobs).where(eq(jobs.id, def.id)).limit(1);
  const job = rows[0];

  // force does not bypass overlap; stale (>30m) running rows may restart
  if (job?.lastStatus === "running" && !isStaleRunning(job.lastStartedAt as Date | null, now)) {
    logger.info({ jobId: def.id }, "job already running; skip");
    return { started: false, skippedReason: SKIP_ALREADY_RUNNING };
  }

  if (job?.lastStatus === "running") {
    await markOpenRunsInterrupted(db, def.id, now);
    logger.warn({ jobId: def.id }, "marking stale running job as interrupted before restart");
  }

  const startedAt = now;
  const insertResult = await db
    .insert(jobRuns)
    .values({
      jobId: def.id,
      startedAt,
      status: "running",
    })
    .returning({ id: jobRuns.id });

  const runId = insertResult[0]?.id;
  if (runId == null) {
    throw new Error(`failed to create job_runs row for ${def.id}`);
  }

  await db
    .update(jobs)
    .set({
      lastStartedAt: startedAt,
      lastStatus: "running",
      lastError: null,
    })
    .where(eq(jobs.id, def.id));

  const setState = async (state: Record<string, unknown> | null) => {
    await db.update(jobs).set({ state }).where(eq(jobs.id, def.id));
  };

  try {
    const message = await def.run({
      db,
      logger,
      warera: opts.warera,
      state: (job?.state as Record<string, unknown> | null) ?? null,
      setState,
    });

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const finalMessage = message ?? null;

    await db
      .update(jobRuns)
      .set({
        finishedAt,
        status: "success",
        message: finalMessage,
        durationMs,
      })
      .where(eq(jobRuns.id, runId));

    await db
      .update(jobs)
      .set({
        lastFinishedAt: finishedAt,
        lastStatus: "success",
        lastError: null,
      })
      .where(eq(jobs.id, def.id));
  } catch (err) {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const errorMessage = err instanceof Error ? err.message : String(err);

    logger.error({ jobId: def.id }, "job failed", err);

    await db
      .update(jobRuns)
      .set({
        finishedAt,
        status: "error",
        message: errorMessage,
        durationMs,
      })
      .where(eq(jobRuns.id, runId));

    await db
      .update(jobs)
      .set({
        lastFinishedAt: finishedAt,
        lastStatus: "error",
        lastError: errorMessage,
      })
      .where(eq(jobs.id, def.id));
  }

  await pruneJobRuns(db, def.id, keep);
  return { started: true };
}
