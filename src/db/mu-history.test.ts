import { beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "./client";
import { createTestDb, truncateAllTables } from "./test/postgres";
import {
  getLatestMemberStatSnapshots,
  getLatestMuStatSnapshot,
  getMuMemberStatHistory,
  getMuStatHistory,
} from "./mu-history";
import { insertMuMemberStatSnapshots, insertMuPoll, insertMuStatSnapshots } from "./mu-stats";

function muSnapshot(muId: string, damages: number) {
  return {
    muId,
    weeklyDamages: damages,
    weeklyDamagesRank: 1,
    weeklyDamagesTier: "gold",
    bounty: null,
    bountyRank: null,
    bountyTier: null,
    reputation: null,
    reputationRank: null,
    reputationTier: null,
    damages,
    damagesRank: 1,
    damagesTier: "gold",
    terrain: null,
    terrainRank: null,
    terrainTier: null,
    wealth: null,
    wealthRank: null,
    wealthTier: null,
    levelingLevel: 1,
    levelingMonthlyDamages: 0,
    payload: null,
  };
}

async function seedMuPoll(
  db: Db,
  recordedAt: Date,
  muId: string,
  damages: number,
  status: "success" | "partial" | "error" = "success",
) {
  const pollId = await insertMuPoll(db, {
    recordedAt,
    status,
    error: status === "error" ? "fail" : null,
    muCount: 1,
    memberCount: 0,
  });
  await insertMuStatSnapshots(db, pollId, [muSnapshot(muId, damages)]);
  return pollId;
}

async function seedMemberPoll(
  db: Db,
  recordedAt: Date,
  muId: string,
  members: { userId: string; weeklyDamagesCount: number }[],
  status: "success" | "partial" | "error" = "success",
) {
  const pollId = await insertMuPoll(db, {
    recordedAt,
    status,
    error: status === "error" ? "fail" : null,
    muCount: 1,
    memberCount: members.length,
  });
  await insertMuMemberStatSnapshots(
    db,
    pollId,
    members.map((m) => ({
      muId,
      userId: m.userId,
      memberRowId: null,
      totalDamagesCount: m.weeklyDamagesCount * 10,
      monthlyDamagesCount: m.weeklyDamagesCount * 2,
      weeklyDamagesCount: m.weeklyDamagesCount,
      totalHelpCount: 0,
      monthlyHelpCount: 0,
      weeklyHelpCount: 0,
      payload: null,
    })),
  );
  return pollId;
}

describe("getMuStatHistory", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  const muId = "mu1";
  const now = new Date("2026-08-01T12:00:00.000Z");

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("returns empty array for unknown MU", async () => {
    expect(await getMuStatHistory(db, "missing", "damages", "7d", now)).toEqual([]);
  });

  it("windows rolling 7d and selects metric column", async () => {
    await seedMuPoll(db, new Date("2026-07-24T12:00:00.000Z"), muId, 1);
    await seedMuPoll(db, new Date("2026-07-30T12:00:00.000Z"), muId, 2);
    await seedMuPoll(db, new Date("2026-08-01T12:00:00.000Z"), muId, 3);

    const history = await getMuStatHistory(db, muId, "damages", "7d", now);
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({
      recordedAt: new Date("2026-07-30T12:00:00.000Z"),
      value: 2,
    });
    expect(history[1]).toEqual({
      recordedAt: new Date("2026-08-01T12:00:00.000Z"),
      value: 3,
    });
  });

  it("filters this_week from Monday 00:00 UTC", async () => {
    const weekNow = new Date("2026-08-05T12:00:00.000Z"); // Wed
    await seedMuPoll(db, new Date("2026-08-02T12:00:00.000Z"), muId, 1); // prior Sun
    await seedMuPoll(db, new Date("2026-08-04T12:00:00.000Z"), muId, 2); // Tue
    await seedMuPoll(db, new Date("2026-08-05T12:00:00.000Z"), muId, 3);

    const history = await getMuStatHistory(db, muId, "damages", "this_week", weekNow);
    expect(history).toHaveLength(2);
    expect(history.map((p) => p.value)).toEqual([2, 3]);
  });

  it("filters last_week between previous Mon and this Mon", async () => {
    const weekNow = new Date("2026-08-05T12:00:00.000Z"); // Wed; this Mon = Aug 3
    await seedMuPoll(db, new Date("2026-07-27T12:00:00.000Z"), muId, 1); // prev Mon
    await seedMuPoll(db, new Date("2026-08-02T12:00:00.000Z"), muId, 2); // Sun
    await seedMuPoll(db, new Date("2026-08-03T00:00:00.000Z"), muId, 3); // this Mon boundary
    await seedMuPoll(db, new Date("2026-08-04T12:00:00.000Z"), muId, 4); // this week

    const history = await getMuStatHistory(db, muId, "damages", "last_week", weekNow);
    expect(history).toHaveLength(3);
    expect(history.map((p) => p.value)).toEqual([1, 2, 3]);
  });

  it("returns all points for all range", async () => {
    await seedMuPoll(db, new Date("2026-01-01T00:00:00.000Z"), muId, 1);
    await seedMuPoll(db, new Date("2026-08-01T12:00:00.000Z"), muId, 2);

    const history = await getMuStatHistory(db, muId, "damages", "all", now);
    expect(history).toHaveLength(2);
  });

  it("ignores error polls", async () => {
    await seedMuPoll(db, now, muId, 9, "error");
    await seedMuPoll(db, now, muId, 5, "success");

    const history = await getMuStatHistory(db, muId, "damages", "7d", now);
    expect(history).toHaveLength(1);
    expect(history[0]?.value).toBe(5);
  });

  it("includes partial polls", async () => {
    await seedMuPoll(db, now, muId, 7, "partial");
    const history = await getMuStatHistory(db, muId, "damages", "7d", now);
    expect(history).toHaveLength(1);
    expect(history[0]?.value).toBe(7);
  });
});

describe("getMuMemberStatHistory", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });
  const muId = "mu1";
  const now = new Date("2026-08-01T12:00:00.000Z");

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("returns empty array for unknown MU", async () => {
    expect(await getMuMemberStatHistory(db, "missing", "weeklyDamagesCount", "7d", now)).toEqual(
      [],
    );
  });

  it("returns one row per userId per poll", async () => {
    const pollAt = new Date("2026-07-30T12:00:00.000Z");
    await seedMemberPoll(db, pollAt, muId, [
      { userId: "u1", weeklyDamagesCount: 10 },
      { userId: "u2", weeklyDamagesCount: 20 },
    ]);
    await seedMemberPoll(db, now, muId, [{ userId: "u1", weeklyDamagesCount: 15 }]);

    const history = await getMuMemberStatHistory(db, muId, "weeklyDamagesCount", "7d", now);
    expect(history).toHaveLength(3);
    expect(history).toEqual(
      expect.arrayContaining([
        { recordedAt: pollAt, userId: "u1", value: 10 },
        { recordedAt: pollAt, userId: "u2", value: 20 },
        { recordedAt: now, userId: "u1", value: 15 },
      ]),
    );
  });

  it("windows rolling 7d", async () => {
    await seedMemberPoll(db, new Date("2026-07-24T12:00:00.000Z"), muId, [
      { userId: "u1", weeklyDamagesCount: 1 },
    ]);
    await seedMemberPoll(db, new Date("2026-07-30T12:00:00.000Z"), muId, [
      { userId: "u1", weeklyDamagesCount: 2 },
    ]);

    const history = await getMuMemberStatHistory(db, muId, "weeklyDamagesCount", "7d", now);
    expect(history).toHaveLength(1);
    expect(history[0]?.value).toBe(2);
  });
});

describe("getLatestMuStatSnapshot", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });
  const muId = "mu1";

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("returns null for unknown MU", async () => {
    expect(await getLatestMuStatSnapshot(db, "missing")).toBeNull();
  });

  it("returns newest successful snapshot", async () => {
    await seedMuPoll(db, new Date("2026-07-30T12:00:00.000Z"), muId, 1);
    await seedMuPoll(db, new Date("2026-08-01T12:00:00.000Z"), muId, 2);
    await seedMuPoll(db, new Date("2026-08-02T12:00:00.000Z"), muId, 99, "error");

    const latest = await getLatestMuStatSnapshot(db, muId);
    expect(latest).not.toBeNull();
    expect(latest!.recordedAt).toEqual(new Date("2026-08-01T12:00:00.000Z"));
    expect(latest!.damages).toBe(2);
  });
});

describe("getLatestMemberStatSnapshots", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });
  const muId = "mu1";

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("returns empty array for unknown MU", async () => {
    expect(await getLatestMemberStatSnapshots(db, "missing")).toEqual([]);
  });

  it("returns members from newest poll with member rows", async () => {
    await seedMemberPoll(db, new Date("2026-07-30T12:00:00.000Z"), muId, [
      { userId: "u1", weeklyDamagesCount: 1 },
    ]);
    await seedMemberPoll(db, new Date("2026-08-01T12:00:00.000Z"), muId, [
      { userId: "u1", weeklyDamagesCount: 10 },
      { userId: "u2", weeklyDamagesCount: 20 },
    ]);
    // newer poll without member rows for this MU
    const emptyPollId = await insertMuPoll(db, {
      recordedAt: new Date("2026-08-02T12:00:00.000Z"),
      status: "success",
      muCount: 0,
      memberCount: 0,
    });
    expect(emptyPollId).toBeGreaterThan(0);

    const latest = await getLatestMemberStatSnapshots(db, muId);
    expect(latest).toHaveLength(2);
    const byUser = new Map(latest.map((r) => [r.userId, r.weeklyDamagesCount]));
    expect(byUser.get("u1")).toBe(10);
    expect(byUser.get("u2")).toBe(20);
    expect(latest[0]?.recordedAt).toEqual(new Date("2026-08-01T12:00:00.000Z"));
  });
});
