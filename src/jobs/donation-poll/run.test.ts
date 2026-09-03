import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import * as schema from "../../db/schema";
import {
  MANUAL_SOURCE_ID,
  SEED_COUNTRY_SWEDEN_ID,
  WATCH_REASON_MANUAL,
  insertMuWatchReason,
} from "../../db/watch-reasons";
import { runDonationPoll } from "./run";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "donation-poll-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE mu_watch_reasons (
      mu_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      source_id TEXT NOT NULL,
      last_touched_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (mu_id, reason, source_id)
    )
  `);
  await client.execute(`
    CREATE TABLE country_watch_reasons (
      country_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      source_id TEXT NOT NULL,
      last_touched_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (country_id, reason, source_id)
    )
  `);
  await client.execute(`
    CREATE TABLE donation_polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      scope_count INTEGER NOT NULL DEFAULT 0,
      row_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  await client.execute(`
    CREATE TABLE donation_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL REFERENCES donation_polls(id),
      scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      donation_row_id TEXT,
      amount REAL,
      donation_created_at INTEGER,
      donation_updated_at INTEGER,
      payload TEXT
    )
  `);
  return drizzle(client, { schema });
}

const MU_ID = "mu-1";
const REASON_AT = new Date("2026-09-03T12:00:00.000Z");

async function seedMuReason(db: Db): Promise<void> {
  await insertMuWatchReason(db, {
    muId: MU_ID,
    reason: WATCH_REASON_MANUAL,
    sourceId: MANUAL_SOURCE_ID,
    at: REASON_AT,
  });
}

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
}

function donation(scope: "mu" | "country") {
  return {
    _id: `${scope}-donation`,
    ...(scope === "mu" ? { muId: MU_ID } : { countryId: SEED_COUNTRY_SWEDEN_ID }),
    userId: `${scope}-user`,
    amount: scope === "mu" ? 100 : 200,
    createdAt: "2026-04-20T08:27:34.084Z",
    updatedAt: "2026-09-03T06:57:17.251Z",
  };
}

describe("runDonationPoll", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createDb();
  });

  it("ensures Sweden and writes snapshots for MU and country scopes", async () => {
    await seedMuReason(db);
    const warera = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          result: { data: { items: [donation("mu")], nextCursor: null } },
        })
        .mockResolvedValueOnce({
          result: { data: { items: [donation("country")], nextCursor: null } },
        }),
    };

    const result = await runDonationPoll({
      db,
      warera: warera as never,
      logger: makeLogger() as never,
    });

    expect(result).toMatchObject({ status: "success", scopeCount: 2, rowCount: 2 });
    expect(warera.request).toHaveBeenCalledTimes(2);
    expect(decodeURIComponent(String(warera.request.mock.calls[0]?.[0]))).toContain(
      `"muId":"${MU_ID}"`,
    );
    expect(decodeURIComponent(String(warera.request.mock.calls[1]?.[0]))).toContain(
      `"countryId":"${SEED_COUNTRY_SWEDEN_ID}"`,
    );
    const countryReasons = await db.select().from(schema.countryWatchReasons);
    expect(countryReasons).toHaveLength(1);
    expect(countryReasons[0]?.countryId).toBe(SEED_COUNTRY_SWEDEN_ID);
    const polls = await db.select().from(schema.donationPolls);
    expect(polls).toHaveLength(1);
    expect(polls[0]).toMatchObject({ status: "success", scopeCount: 2, rowCount: 2 });
    const snapshots = await db.select().from(schema.donationSnapshots);
    expect(snapshots).toHaveLength(2);
    expect(snapshots.map(({ scopeType, scopeId }) => ({ scopeType, scopeId }))).toEqual([
      { scopeType: "mu", scopeId: MU_ID },
      { scopeType: "country", scopeId: SEED_COUNTRY_SWEDEN_ID },
    ]);
  });

  it("marks partial and writes the successful scope when another scope fails", async () => {
    await seedMuReason(db);
    const warera = {
      request: vi
        .fn()
        .mockRejectedValueOnce(new Error("MU donations unavailable"))
        .mockResolvedValueOnce({
          result: { data: { items: [donation("country")], nextCursor: null } },
        }),
    };

    const result = await runDonationPoll({
      db,
      warera: warera as never,
      logger: makeLogger() as never,
    });

    expect(result).toMatchObject({ status: "partial", scopeCount: 1, rowCount: 1 });
    const polls = await db.select().from(schema.donationPolls);
    expect(polls[0]?.status).toBe("partial");
    expect(polls[0]?.error).toContain(`mu:${MU_ID}: MU donations unavailable`);
    const snapshots = await db.select().from(schema.donationSnapshots);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      scopeType: "country",
      scopeId: SEED_COUNTRY_SWEDEN_ID,
    });
  });
});
