import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "./client";
import { createTestDb, truncateAllTables } from "./test/postgres";
import * as schema from "./schema";
import { insertMuMemberStatSnapshots, insertMuPoll, insertMuStatSnapshots } from "./mu-stats";

describe("mu-stats db", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
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
