import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "./client";
import * as schema from "./schema";
import {
  insertMuMemberStatSnapshots,
  insertMuPoll,
  insertMuStatSnapshots,
} from "./mu-stats";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "mu-stats-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE mu_polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      mu_count INTEGER NOT NULL DEFAULT 0,
      member_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  await client.execute(`
    CREATE TABLE mu_stat_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL REFERENCES mu_polls(id),
      mu_id TEXT NOT NULL,
      weekly_damages REAL,
      weekly_damages_rank INTEGER,
      weekly_damages_tier TEXT,
      bounty REAL,
      bounty_rank INTEGER,
      bounty_tier TEXT,
      reputation REAL,
      reputation_rank INTEGER,
      reputation_tier TEXT,
      damages REAL,
      damages_rank INTEGER,
      damages_tier TEXT,
      terrain REAL,
      terrain_rank INTEGER,
      terrain_tier TEXT,
      wealth REAL,
      wealth_rank INTEGER,
      wealth_tier TEXT,
      leveling_level INTEGER,
      leveling_monthly_damages REAL,
      payload TEXT
    )
  `);
  await client.execute(`
    CREATE TABLE mu_member_stat_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL REFERENCES mu_polls(id),
      mu_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      member_row_id TEXT,
      total_damages_count INTEGER,
      monthly_damages_count INTEGER,
      weekly_damages_count INTEGER,
      total_help_count INTEGER,
      monthly_help_count INTEGER,
      weekly_help_count INTEGER,
      payload TEXT
    )
  `);
  return drizzle(client, { schema });
}

describe("mu-stats db", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
  });

  it("inserts poll and snapshots", async () => {
    const pollId = await insertMuPoll(db, {
      recordedAt: new Date("2026-08-03T12:00:00.000Z"),
      status: "success",
      error: null,
      muCount: 1,
      memberCount: 1,
    });
    await insertMuStatSnapshots(db, pollId, [
      {
        muId: "mu1",
        weeklyDamages: 10,
        weeklyDamagesRank: 1,
        weeklyDamagesTier: "gold",
        bounty: null,
        bountyRank: null,
        bountyTier: null,
        reputation: null,
        reputationRank: null,
        reputationTier: null,
        damages: 100,
        damagesRank: 2,
        damagesTier: "platinum",
        terrain: null,
        terrainRank: null,
        terrainTier: null,
        wealth: null,
        wealthRank: null,
        wealthTier: null,
        levelingLevel: 1,
        levelingMonthlyDamages: 0,
        payload: null,
      },
    ]);
    await insertMuMemberStatSnapshots(db, pollId, [
      {
        muId: "mu1",
        userId: "u1",
        memberRowId: "row1",
        totalDamagesCount: 5,
        monthlyDamagesCount: 1,
        weeklyDamagesCount: 0,
        totalHelpCount: 2,
        monthlyHelpCount: 0,
        weeklyHelpCount: 0,
        payload: null,
      },
    ]);
    expect(pollId).toBeGreaterThan(0);
    const muSnaps = await db
      .select()
      .from(schema.muStatSnapshots)
      .where(eq(schema.muStatSnapshots.pollId, pollId));
    expect(muSnaps).toHaveLength(1);
    expect(muSnaps[0]?.damages).toBe(100);
    const memberSnaps = await db
      .select()
      .from(schema.muMemberStatSnapshots)
      .where(eq(schema.muMemberStatSnapshots.pollId, pollId));
    expect(memberSnaps).toHaveLength(1);
    expect(memberSnaps[0]?.totalDamagesCount).toBe(5);
  });

  it("no-ops on empty snapshot arrays", async () => {
    const pollId = await insertMuPoll(db, {
      recordedAt: new Date("2026-08-03T12:00:00.000Z"),
      status: "error",
      error: "none",
      muCount: 0,
      memberCount: 0,
    });
    await insertMuStatSnapshots(db, pollId, []);
    await insertMuMemberStatSnapshots(db, pollId, []);
    expect(pollId).toBeGreaterThan(0);
  });
});
