import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../db/client";
import * as schema from "../db/schema";
import { jobRuns, jobs } from "../db/schema";
import type { Logger } from "../logging/logger";
import type { WareraRequester } from "../warera/prices";
import type { JobDefinition } from "./types";
import {
  INTERRUPTED_MESSAGE,
  isStaleRunning,
  OVERUN_MESSAGE,
  recordJobOverrun,
  runJob,
} from "./runner";

vi.mock("../logging/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../logging/context")>();
  return {
    ...actual,
    withLogContext: vi.fn(actual.withLogContext),
  };
});

import { withLogContext } from "../logging/context";

const silentLogger = {
  silly: () => {},
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => silentLogger,
} as unknown as Logger;

async function createMemoryJobsDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  await client.execute(`
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '' NOT NULL,
      enabled INTEGER DEFAULT 1 NOT NULL,
      cron TEXT NOT NULL,
      max_runs INTEGER,
      last_started_at INTEGER,
      last_finished_at INTEGER,
      last_status TEXT,
      last_error TEXT,
      state TEXT
    )
  `);
  await client.execute(`
    CREATE TABLE job_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      status TEXT NOT NULL,
      message TEXT,
      duration_ms INTEGER
    )
  `);
  return drizzle(client, { schema });
}

describe("isStaleRunning", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");

  it("treats missing lastStartedAt as stale", () => {
    expect(isStaleRunning(null, now)).toBe(true);
    expect(isStaleRunning(undefined, now)).toBe(true);
  });

  it("is not stale within 30 minutes", () => {
    const started = new Date(now.getTime() - 29 * 60 * 1000);
    expect(isStaleRunning(started, now)).toBe(false);
  });

  it("is stale after 30 minutes", () => {
    const started = new Date(now.getTime() - 30 * 60 * 1000 - 1);
    expect(isStaleRunning(started, now)).toBe(true);
  });
});

describe("INTERRUPTED_MESSAGE", () => {
  it("uses a stable interrupted/stale label", () => {
    expect(INTERRUPTED_MESSAGE).toBe("interrupted/stale");
  });
});

describe("runJob log correlation", () => {
  it("wraps def.run in withLogContext and passes a child logger with job_id and job_run_id", async () => {
    const db = await createMemoryJobsDb();
    await db.insert(jobs).values({
      id: "test-job",
      name: "Test",
      description: "",
      cron: "0 * * * * *",
      enabled: true,
    });

    let loggerPassedToRun: Logger | undefined;
    const def: JobDefinition = {
      id: "test-job",
      name: "Test",
      description: "",
      defaultCron: "0 * * * * *",
      async run(ctx) {
        loggerPassedToRun = ctx.logger;
        ctx.logger.debug({ marker: true }, "inside run");
        return "ok";
      },
    };

    const childCalls: Array<{ name?: string; bindings?: Record<string, unknown> }> = [];
    const parentLogger = {
      ...silentLogger,
      child: (opts?: { name?: string; bindings?: Record<string, unknown> }) => {
        childCalls.push(opts ?? {});
        const child = {
          ...silentLogger,
          debug: () => {},
          child: () => child,
        };
        return child as Logger;
      },
    } as Logger;

    const warera = { request: vi.fn() } as unknown as WareraRequester;

    vi.mocked(withLogContext).mockClear();
    await runJob(db, parentLogger, def, { warera });

    expect(withLogContext).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          job_id: "test-job",
          job_run_id: expect.any(Number),
        }),
        spanName: "test-job",
        spanOp: "job.run",
      }),
      expect.any(Function),
    );

    expect(childCalls[0]?.bindings).toMatchObject({
      job_id: "test-job",
      job_run_id: expect.any(Number),
    });
    expect(loggerPassedToRun).toBeDefined();
  });
});

describe("recordJobOverrun", () => {
  it("inserts a failed job_runs row without flipping jobs.last_status", async () => {
    const db = await createMemoryJobsDb();
    const startedAt = new Date("2026-08-04T12:00:00.000Z");

    await db.insert(jobs).values({
      id: "example-heartbeat",
      name: "Example",
      description: "",
      cron: "0 * * * * *",
      enabled: true,
      lastStatus: "running",
      lastStartedAt: startedAt,
    });

    await recordJobOverrun(db, silentLogger, "example-heartbeat");

    const runs = await db.select().from(jobRuns).where(eq(jobRuns.jobId, "example-heartbeat"));
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("error");
    expect(runs[0]?.message).toBe(OVERUN_MESSAGE);
    expect(runs[0]?.durationMs).toBe(0);

    const jobRows = await db.select().from(jobs).where(eq(jobs.id, "example-heartbeat"));
    expect(jobRows[0]?.lastStatus).toBe("running");
  });
});
