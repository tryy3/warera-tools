import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppConfig } from "../../config/env";
import type { Db } from "../../db/client";
import { jobRuns, jobs } from "../../db/schema";
import { listJobDefinitions, runJob, type SchedulerHandle } from "../../jobs";
import type { Logger } from "../../logging/logger";
import { HttpError } from "../errors";

export type JobsRouteDeps = {
  db: Db;
  logger: Logger;
  scheduler: SchedulerHandle;
  config: AppConfig;
  warera: { request: <T>(path: string, init?: RequestInit) => Promise<T> };
};

export function jobsRoutes(deps: JobsRouteDeps) {
  const { db, logger, scheduler, config, warera } = deps;
  const app = new Hono();
  const defs = new Map(listJobDefinitions().map((d) => [d.id, d]));

  app.get("/", async (c) => {
    const rows = await db.select().from(jobs);
    return c.json({ jobs: rows });
  });

  app.get("/:id/runs", async (c) => {
    const id = c.req.param("id");
    const existing = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, id)).limit(1);
    if (!existing[0]) {
      throw new HttpError(404, "not_found", `Job ${id} not found`);
    }

    const rawLimit = Number(c.req.query("limit") ?? 20);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 20;

    const runs = await db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.jobId, id))
      .orderBy(desc(jobRuns.startedAt))
      .limit(limit);

    return c.json({ runs });
  });

  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    if (!existing[0]) {
      throw new HttpError(404, "not_found", `Job ${id} not found`);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new HttpError(400, "invalid_body", "Request body must be JSON");
    }

    if (body == null || typeof body !== "object" || Array.isArray(body)) {
      throw new HttpError(400, "invalid_body", "Request body must be an object");
    }

    const { enabled, cron } = body as { enabled?: unknown; cron?: unknown };
    const patch: { enabled?: boolean; cron?: string } = {};

    if (enabled !== undefined) {
      if (typeof enabled !== "boolean") {
        throw new HttpError(400, "invalid_body", "enabled must be a boolean");
      }
      patch.enabled = enabled;
    }
    if (cron !== undefined) {
      if (typeof cron !== "string" || cron.trim() === "") {
        throw new HttpError(400, "invalid_body", "cron must be a non-empty string");
      }
      patch.cron = cron;
    }

    if (Object.keys(patch).length > 0) {
      await db.update(jobs).set(patch).where(eq(jobs.id, id));
    }

    await scheduler.reloadJob(id);

    const rows = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    return c.json({ job: rows[0] });
  });

  app.post("/:id/run", async (c) => {
    const id = c.req.param("id");
    const def = defs.get(id);
    if (!def) {
      throw new HttpError(404, "not_found", `Job ${id} not found`);
    }

    const existing = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, id)).limit(1);
    if (!existing[0]) {
      throw new HttpError(404, "not_found", `Job ${id} not found`);
    }

    const result = await runJob(db, logger, def, {
      force: true,
      keep: config.jobRunHistoryLimit,
      warera,
    });

    if (!result.started) {
      throw new HttpError(409, "job_busy", result.skippedReason ?? "job already running");
    }

    const rows = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    return c.json({ ok: true, job: rows[0] });
  });

  return app;
}
