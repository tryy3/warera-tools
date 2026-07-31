import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { jobRuns, jobs } from "../db/schema";
import type { Logger } from "../logging/logger";
import { pruneJobRuns } from "./prune";
import type { JobDefinition } from "./types";

const STALE_RUNNING_MS = 30 * 60 * 1000;
const DEFAULT_JOB_RUN_HISTORY_LIMIT = 50;

function isStaleRunning(lastStartedAt: Date | null | undefined, now: Date): boolean {
  if (!lastStartedAt) return true;
  return now.getTime() - lastStartedAt.getTime() > STALE_RUNNING_MS;
}

export async function runJob(
  db: Db,
  logger: Logger,
  def: JobDefinition,
  _opts?: { force?: boolean },
): Promise<void> {
  const now = new Date();
  const rows = await db.select().from(jobs).where(eq(jobs.id, def.id)).limit(1);
  const job = rows[0];

  // force does not bypass overlap; stale (>30m) running rows may restart
  if (job?.lastStatus === "running" && !isStaleRunning(job.lastStartedAt as Date | null, now)) {
    logger.info({ jobId: def.id }, "job already running; skip");
    return;
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

    logger.error({ err, jobId: def.id }, "job failed");

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

  await pruneJobRuns(db, def.id, DEFAULT_JOB_RUN_HISTORY_LIMIT);
}
