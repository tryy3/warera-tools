import { beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { ParsedFightState } from "../warera/fight-state";
import type { Db } from "./client";
import * as schema from "./schema";
import { createTestDb, truncateAllTables } from "./test/postgres";
import {
  fightStateContentFingerprint,
  getLatestFightState,
  insertUserFightPoll,
  insertUserFightSnapshots,
  listLatestFightStatesForMu,
  type UserFightSnapshotRow,
} from "./user-fight-state";

function fightRow(overrides: Partial<UserFightSnapshotRow> = {}): UserFightSnapshotRow {
  return {
    userId: "user-1",
    muId: "mu-1",
    recordedAt: new Date("2026-09-15T12:00:00.000Z"),
    username: "Fighter",
    level: 42,
    militaryRankBonus: 0.35,
    ammoLabel: "Q5",
    pillLabel: "cocain",
    pillEndsAt: new Date("2026-09-15T13:00:00.000Z"),
    skillLevels: { attack: 11, armor: 7 },
    lastSkillsResetAt: new Date("2026-09-01T00:00:00.000Z"),
    avatarUrl: "https://example.test/avatar.png",
    atk: 1234.5,
    precision: 0.82,
    critChance: 0.24,
    critDamage: 2.66,
    armor: 480,
    dodge: 130,
    hp: 900,
    maxHp: 1000,
    hunger: 88,
    maxHunger: 100,
    hpRegenPerHour: 60,
    hungerRegenPerHour: 12,
    pillStatus: "active",
    ...overrides,
  };
}

function parsed(row: UserFightSnapshotRow): ParsedFightState {
  const { muId: _muId, recordedAt: _recordedAt, ...state } = row;
  return state;
}

describe("user fight state db", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("fingerprints content canonically without capture time", () => {
    const first = fightRow({ skillLevels: { attack: 11, armor: 7 } });
    const same = fightRow({
      recordedAt: new Date("2026-09-15T12:05:00.000Z"),
      skillLevels: { armor: 7, attack: 11 },
    });

    expect(fightStateContentFingerprint(first)).toBe(fightStateContentFingerprint(same));
    expect(fightStateContentFingerprint(fightRow({ hp: 899 }))).not.toBe(
      fightStateContentFingerprint(first),
    );
  });

  it("appends changed snapshots and returns the latest parsed fight state", async () => {
    const firstPollId = await insertUserFightPoll(db, {
      recordedAt: new Date("2026-09-15T12:00:00.000Z"),
      status: "success",
      userCount: 1,
      muCount: 1,
    });
    const first = fightRow();
    expect(await insertUserFightSnapshots(db, firstPollId, [first])).toBe(1);

    const secondPollId = await insertUserFightPoll(db, {
      recordedAt: new Date("2026-09-15T12:05:00.000Z"),
      status: "success",
      userCount: 1,
      muCount: 1,
    });
    expect(
      await insertUserFightSnapshots(db, secondPollId, [
        fightRow({ recordedAt: new Date("2026-09-15T12:05:00.000Z") }),
      ]),
    ).toBe(0);

    const latestRow = fightRow({
      recordedAt: new Date("2026-09-15T12:10:00.000Z"),
      hp: 750,
      pillStatus: "debuff",
      pillLabel: null,
      pillEndsAt: null,
    });
    expect(await insertUserFightSnapshots(db, secondPollId, [latestRow])).toBe(1);

    await expect(getLatestFightState(db, "user-1")).resolves.toEqual(parsed(latestRow));
    await expect(getLatestFightState(db, "missing")).resolves.toBeNull();
  });

  it("processes each user's batch in recordedAt order before fingerprinting", async () => {
    const pollId = await insertUserFightPoll(db, {
      recordedAt: new Date("2026-09-15T12:00:00.000Z"),
      status: "success",
      userCount: 1,
      muCount: 1,
    });
    const baseline = fightRow();
    expect(await insertUserFightSnapshots(db, pollId, [baseline])).toBe(1);

    const unchangedMiddle = fightRow({
      recordedAt: new Date("2026-09-15T12:05:00.000Z"),
    });
    const latestChanged = fightRow({
      recordedAt: new Date("2026-09-15T12:10:00.000Z"),
      hp: 750,
      pillStatus: "debuff",
      pillLabel: null,
      pillEndsAt: null,
    });
    const outOfOrderBatch = [latestChanged, unchangedMiddle];

    expect(await insertUserFightSnapshots(db, pollId, outOfOrderBatch)).toBe(1);
    await expect(getLatestFightState(db, "user-1")).resolves.toEqual(parsed(latestChanged));
  });

  it("lists only each current MU member's latest fight state, breaking time ties by id", async () => {
    const at = new Date("2026-09-15T12:00:00.000Z");
    await db.insert(schema.mus).values([
      { id: "mu-1", name: "One", enqueuedAt: at },
      { id: "mu-2", name: "Two", enqueuedAt: at },
    ]);
    await db.insert(schema.muMembers).values([
      { muId: "mu-1", userId: "user-1", role: null, updatedAt: at },
      { muId: "mu-1", userId: "user-2", role: null, updatedAt: at },
      { muId: "mu-2", userId: "former-member", role: null, updatedAt: at },
    ]);
    const pollId = await insertUserFightPoll(db, {
      recordedAt: at,
      status: "success",
      userCount: 3,
      muCount: 2,
    });
    const user1 = fightRow();
    const user1Latest = fightRow({
      hp: 700,
    });
    const user2 = fightRow({ userId: "user-2", username: "Second" });
    const former = fightRow({ userId: "former-member", username: "Former" });
    await insertUserFightSnapshots(db, pollId, [user1, user1Latest, user2, former]);

    const result = await listLatestFightStatesForMu(db, "mu-1");

    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([parsed(user1Latest), parsed(user2)]));
  });
});
