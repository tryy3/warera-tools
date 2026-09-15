import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { ParsedFightState } from "../warera/fight-state";
import type { Db } from "./client";
import * as schema from "./schema";
import {
  fightStateContentFingerprint,
  getLatestFightState,
  insertUserFightPoll,
  insertUserFightSnapshots,
  listLatestFightStatesForMu,
  type UserFightSnapshotRow,
} from "./user-fight-state";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "user-fight-state-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE mus (
      id TEXT PRIMARY KEY,
      name TEXT,
      avatar_url TEXT,
      country_id TEXT,
      region_id TEXT,
      owner_user_id TEXT,
      mercenary_reputation REAL,
      level INTEGER,
      created_at_game INTEGER,
      roles TEXT,
      active_upgrade_levels TEXT,
      payload TEXT,
      enqueued_at INTEGER NOT NULL,
      fetched_at INTEGER
    )
  `);
  await client.execute(`
    CREATE TABLE mu_members (
      mu_id TEXT NOT NULL REFERENCES mus(id),
      user_id TEXT NOT NULL,
      role TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (mu_id, user_id)
    )
  `);
  await client.execute(`
    CREATE TABLE user_fight_polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      user_count INTEGER NOT NULL DEFAULT 0,
      mu_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  await client.execute(`
    CREATE TABLE user_fight_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL REFERENCES user_fight_polls(id),
      user_id TEXT NOT NULL,
      mu_id TEXT NOT NULL,
      recorded_at INTEGER NOT NULL,
      username TEXT NOT NULL,
      level INTEGER NOT NULL,
      military_rank_bonus REAL NOT NULL,
      ammo_label TEXT,
      pill_label TEXT,
      pill_ends_at INTEGER,
      skill_levels TEXT NOT NULL,
      last_skills_reset_at INTEGER,
      avatar_url TEXT,
      atk REAL NOT NULL,
      precision REAL NOT NULL,
      crit_chance REAL NOT NULL,
      crit_damage REAL NOT NULL,
      armor REAL NOT NULL,
      dodge REAL NOT NULL,
      hp REAL NOT NULL,
      max_hp REAL NOT NULL,
      hunger REAL NOT NULL,
      max_hunger REAL NOT NULL,
      hp_regen_per_hour REAL NOT NULL,
      hunger_regen_per_hour REAL NOT NULL,
      pill_status TEXT NOT NULL
    )
  `);
  return drizzle(client, { schema });
}

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

  beforeEach(async () => {
    db = await createDb();
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

  it("lists each current MU member's latest fight state", async () => {
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
      recordedAt: new Date("2026-09-15T12:05:00.000Z"),
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
