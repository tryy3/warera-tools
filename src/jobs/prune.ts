import { and, desc, eq, lt, or } from "drizzle-orm";
import type { Db } from "../db/client";
import { jobRuns } from "../db/schema";

export async function pruneJobRuns(db: Db, jobId: string, keep: number): Promise<void> {
  if (keep < 0) {
    throw new Error("keep must be >= 0");
  }

  if (keep === 0) {
    await db.delete(jobRuns).where(eq(jobRuns.jobId, jobId));
    return;
  }

  const keepRows = await db
    .select({ id: jobRuns.id, startedAt: jobRuns.startedAt })
    .from(jobRuns)
    .where(eq(jobRuns.jobId, jobId))
    .orderBy(desc(jobRuns.startedAt), desc(jobRuns.id))
    .limit(keep);

  if (keepRows.length < keep) {
    return;
  }

  const cutoff = keepRows[keepRows.length - 1]!;
  const cutoffStartedAt = cutoff.startedAt as Date;

  await db
    .delete(jobRuns)
    .where(
      and(
        eq(jobRuns.jobId, jobId),
        or(
          lt(jobRuns.startedAt, cutoffStartedAt),
          and(eq(jobRuns.startedAt, cutoffStartedAt), lt(jobRuns.id, cutoff.id)),
        ),
      ),
    );
}
