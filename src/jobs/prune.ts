import { and, desc, eq, notInArray } from "drizzle-orm";
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
    .select({ id: jobRuns.id })
    .from(jobRuns)
    .where(eq(jobRuns.jobId, jobId))
    .orderBy(desc(jobRuns.startedAt), desc(jobRuns.id))
    .limit(keep);

  const keepIds = keepRows.map((row) => row.id);
  if (keepIds.length === 0) {
    return;
  }

  await db
    .delete(jobRuns)
    .where(and(eq(jobRuns.jobId, jobId), notInArray(jobRuns.id, keepIds)));
}
