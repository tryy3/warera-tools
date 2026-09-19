import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import { createTestDb, truncateAllTables } from "../../db/test/postgres";
import { listMuMembers } from "../../db/mus";
import * as schema from "../../db/schema";
import {
  MANUAL_SOURCE_ID,
  WATCH_REASON_MANUAL,
  insertMuWatchReason,
  insertPlayerWatchReason,
} from "../../db/watch-reasons";
import { SEED_MU_ID } from "../../warera/mu";
import { runMuStatsPoll } from "./run";

const REASON_AT = new Date("2026-08-21T00:00:00.000Z");

async function seedMuReason(db: Db, muId: string): Promise<void> {
  await insertMuWatchReason(db, {
    muId,
    reason: WATCH_REASON_MANUAL,
    sourceId: MANUAL_SOURCE_ID,
    at: REASON_AT,
  });
}

const muFixture = {
  _id: SEED_MU_ID,
  name: "Sweed Liberty",
  user: "owner1",
  region: "reg1",
  country: "cty1",
  members: ["u1", "owner1"],
  roles: { managers: [], commanders: ["u1"] },
  leveling: { level: 1, monthlyDamages: 10 },
  activeUpgradeLevels: { headquarters: 4 },
  rankings: {
    muWeeklyDamages: { value: 100, rank: 1, tier: "gold" },
    muBounty: { value: 2, rank: 2, tier: "silver" },
    muReputation: { value: 1, rank: 3, tier: "gold" },
    muDamages: { value: 999, rank: 4, tier: "platinum" },
    muTerrain: { value: 50, rank: 5, tier: "gold" },
    muWealth: { value: 7, rank: 6, tier: "platinum" },
  },
  createdAt: "2026-04-20T07:56:38.148Z",
};

const memberFixture = [
  {
    _id: "row1",
    mu: SEED_MU_ID,
    user: "u1",
    totalDamagesCount: 10,
    monthlyDamagesCount: 2,
    weeklyDamagesCount: 1,
    totalHelpCount: 3,
    monthlyHelpCount: 1,
    weeklyHelpCount: 0,
  },
];

describe("runMuStatsPoll", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  function makeWarera() {
    return {
      request: vi.fn(async (path: string) => {
        if (path.includes("muMember.getByMu")) {
          return { result: { data: memberFixture } };
        }
        if (path.includes("mu.getById")) {
          return { result: { data: muFixture } };
        }
        throw new Error(`unexpected path ${path}`);
      }),
      requestBatch: vi.fn(async () => []),
    };
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

  it("writes no-op success poll when watchlist is empty", async () => {
    const warera = makeWarera();
    const logger = makeLogger();
    const result = await runMuStatsPoll({
      db,
      warera: warera as never,
      logger: logger as never,
    });
    expect(result.status).toBe("success");
    expect(result.muCount).toBe(0);
    expect(result.memberCount).toBe(0);
    expect(warera.request).not.toHaveBeenCalled();
    const polls = await db.select().from(schema.muPolls);
    expect(polls).toHaveLength(1);
    expect(polls[0]?.status).toBe("success");
    expect(polls[0]?.muCount).toBe(0);
  });

  it("fetches MUs with a watch reason and writes snapshots", async () => {
    await seedMuReason(db, SEED_MU_ID);
    const warera = makeWarera();
    const logger = makeLogger();
    const result = await runMuStatsPoll({
      db,
      warera: warera as never,
      logger: logger as never,
    });
    expect(result.status).toBe("success");
    expect(result.muCount).toBe(1);
    expect(result.memberCount).toBe(1);
    const muRow = await db.select().from(schema.mus).where(eq(schema.mus.id, SEED_MU_ID));
    expect(muRow[0]?.name).toBe("Sweed Liberty");
    expect(await listMuMembers(db, SEED_MU_ID)).toHaveLength(2);
    const polls = await db.select().from(schema.muPolls);
    expect(polls).toHaveLength(1);
    expect(polls[0]?.status).toBe("success");
  });

  it("skips mus rows that have no watch reason", async () => {
    await seedMuReason(db, SEED_MU_ID);
    // An extra mus row without a reason must not be fetched.
    await db
      .insert(schema.mus)
      .values({ id: "orphan-mu", enqueuedAt: REASON_AT })
      .onConflictDoNothing();
    const warera = makeWarera();
    const logger = makeLogger();
    const result = await runMuStatsPoll({
      db,
      warera: warera as never,
      logger: logger as never,
    });
    expect(result.status).toBe("success");
    expect(result.muCount).toBe(1);
    const getByIdCalls = warera.request.mock.calls.filter((c) =>
      String(c[0]).includes("mu.getById"),
    );
    expect(getByIdCalls).toHaveLength(1);
    expect(String(getByIdCalls[0]?.[0])).toContain(SEED_MU_ID);
    expect(String(getByIdCalls[0]?.[0])).not.toContain("orphan-mu");
  });

  it("marks partial when member fetch fails but still writes MU snapshot", async () => {
    await seedMuReason(db, SEED_MU_ID);
    const warera = {
      request: vi.fn(async (path: string) => {
        if (path.includes("muMember.getByMu")) throw new Error("members down");
        if (path.includes("mu.getById")) return { result: { data: muFixture } };
        throw new Error(`unexpected path ${path}`);
      }),
      requestBatch: vi.fn(async () => []),
    };
    const logger = makeLogger();
    const result = await runMuStatsPoll({
      db,
      warera: warera as never,
      logger: logger as never,
    });
    expect(result.status).toBe("partial");
    expect(result.muCount).toBe(1);
    expect(result.memberCount).toBe(0);
    const muRow = await db.select().from(schema.mus).where(eq(schema.mus.id, SEED_MU_ID));
    expect(muRow[0]?.name).toBe("Sweed Liberty");
    const memberSnaps = await db.select().from(schema.muMemberStatSnapshots);
    expect(memberSnaps).toHaveLength(0);
    const muSnaps = await db.select().from(schema.muStatSnapshots);
    expect(muSnaps).toHaveLength(1);
  });

  it("captures syncFollowedPlayers errors and marks partial when MU fetch succeeds", async () => {
    await seedMuReason(db, SEED_MU_ID);
    // A followed player whose getUserById batch slot fails (requestBatch returns []).
    await insertPlayerWatchReason(db, {
      playerId: "p1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at: REASON_AT,
    });
    const warera = makeWarera();
    const logger = makeLogger();
    const result = await runMuStatsPoll({
      db,
      warera: warera as never,
      logger: logger as never,
    });
    expect(result.status).toBe("partial");
    expect(result.muCount).toBe(1);
    const polls = await db.select().from(schema.muPolls);
    expect(polls[0]?.status).toBe("partial");
    expect(polls[0]?.error).toContain("sync:");
  });
});
