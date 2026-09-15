import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import { insertUserFightPoll, insertUserFightSnapshots } from "../../db/user-fight-state";
import * as schema from "../../db/schema";
import type { TrpcBatchSlotResult, WareraBatchItem } from "../../warera/trpc";
import { errorPayload } from "../errors";
import { muFightDeskRoutes } from "./mu-fight-desk";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "mu-fight-desk-route-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE mus (
      id TEXT PRIMARY KEY NOT NULL,
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

const NOW = new Date("2026-09-15T12:00:00.000Z");

function logger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
}

function appFor(
  db: Db,
  requestBatch?: (items: WareraBatchItem[]) => Promise<TrpcBatchSlotResult[]>,
) {
  const batch = requestBatch ?? vi.fn(async (_items: WareraBatchItem[]) => []);
  const app = new Hono();
  app.onError((err, c) => {
    const { status, body } = errorPayload(err);
    return c.json(body, status as ContentfulStatusCode);
  });
  app.route(
    "/",
    muFightDeskRoutes({
      db,
      warera: { request: vi.fn(), requestBatch: batch } as never,
      logger: logger() as never,
    }),
  );
  return { app, requestBatch: batch };
}

async function seedMu(db: Db, userIds: string[], watched = false): Promise<void> {
  await db.insert(schema.mus).values({
    id: "mu-1",
    name: "First Unit",
    enqueuedAt: NOW,
    fetchedAt: NOW,
  });
  if (userIds.length > 0) {
    await db.insert(schema.muMembers).values(
      userIds.map((userId, index) => ({
        muId: "mu-1",
        userId,
        role: index === 0 ? "owner" : "member",
        updatedAt: NOW,
      })),
    );
  }
  if (watched) {
    await db.insert(schema.muWatchReasons).values({
      muId: "mu-1",
      reason: "manual",
      sourceId: "test",
      lastTouchedAt: NOW,
      createdAt: NOW,
    });
  }
}

function parsedFight(userId: string, username = `fighter-${userId}`) {
  return {
    userId,
    username,
    level: 42,
    militaryRankBonus: 0.35,
    ammoLabel: "Q5",
    pillLabel: "cocain",
    pillEndsAt: new Date("2026-09-15T13:00:00.000Z"),
    skillLevels: { attack: 11, health: 9 },
    lastSkillsResetAt: new Date("2026-09-01T00:00:00.000Z"),
    avatarUrl: `https://example.test/${userId}.png`,
    atk: 1_234,
    precision: 0.82,
    critChance: 0.24,
    critDamage: 2.66,
    armor: 480,
    dodge: 130,
    hp: 900,
    maxHp: 1_000,
    hunger: 88,
    maxHunger: 100,
    hpRegenPerHour: 60,
    hungerRegenPerHour: 12,
    pillStatus: "active" as const,
  };
}

function rawFight(userId: string) {
  return {
    _id: userId,
    username: `fighter-${userId}`,
    avatarUrl: `https://example.test/${userId}.png`,
    leveling: { level: 42 },
    equipment: { ammo: "Q5" },
    buffs: { buffCodes: ["cocain"], buffEndAt: "2026-09-15T13:00:00.000Z" },
    dates: { lastSkillsResetAt: "2026-09-01T00:00:00.000Z" },
    skills: {
      attack: {
        total: 1_234,
        level: 11,
        militaryRankPercent: 35,
        buffsPercent: 15,
        debuffsPercent: 0,
      },
      precision: { total: 82, level: 8 },
      criticalChance: { total: 24, level: 6 },
      criticalDamages: { total: 266, level: 7 },
      armor: { total: 480, level: 5 },
      dodge: { total: 130, level: 4 },
      health: { total: 1_000, currentBarValue: 900, hourlyBarRegen: 60, level: 9 },
      hunger: { total: 100, currentBarValue: 88, hourlyBarRegen: 12, level: 3 },
    },
  };
}

describe("muFightDeskRoutes", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createDb();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an empty member list for an MU with an empty roster", async () => {
    await seedMu(db, []);
    const { app, requestBatch } = appFor(db);

    const res = await app.request("http://localhost/mu-1/fight-desk");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      mu: { id: "mu-1", name: "First Unit" },
      asOf: null,
      members: [],
      meta: { watched: false, liveFilled: false, refreshFailedUserIds: [] },
    });
    expect(requestBatch).not.toHaveBeenCalled();
  });

  it("marks a roster member without a snapshot incomplete", async () => {
    await seedMu(db, ["u1"]);
    const { app } = appFor(db);

    const res = await app.request("http://localhost/mu-1/fight-desk");

    expect(res.status).toBe(200);
    expect(((await res.json()) as { members: unknown[] }).members).toEqual([
      {
        userId: "u1",
        username: null,
        level: null,
        role: "owner",
        incomplete: true,
        fight: null,
        display: {
          avatarUrl: null,
          militaryRankBonus: null,
          ammoLabel: null,
          pillLabel: null,
          pillEndsAt: null,
          skillLevels: {},
          lastSkillsResetAt: null,
        },
      },
    ]);
  });

  it("returns latest stored fight inputs and the newest snapshot time", async () => {
    await seedMu(db, ["u1", "u2"], true);
    const oldAt = new Date("2026-09-15T11:55:00.000Z");
    const pollId = await insertUserFightPoll(db, {
      recordedAt: oldAt,
      status: "success",
      userCount: 2,
      muCount: 1,
    });
    await insertUserFightSnapshots(db, pollId, [
      { ...parsedFight("u1", "alice"), muId: "mu-1", recordedAt: oldAt },
      { ...parsedFight("u2", "bob"), muId: "mu-1", recordedAt: NOW },
    ]);
    const { app, requestBatch } = appFor(db);

    const res = await app.request("http://localhost/mu-1/fight-desk");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      asOf: string | null;
      members: Array<Record<string, unknown>>;
      meta: {
        watched: boolean;
        liveFilled: boolean;
        refreshFailedUserIds: string[];
      };
    };
    expect(body.asOf).toBe(NOW.toISOString());
    expect(body.meta).toEqual({
      watched: true,
      liveFilled: false,
      refreshFailedUserIds: [],
    });
    expect(body.members[0]).toMatchObject({
      userId: "u1",
      username: "alice",
      level: 42,
      role: "owner",
      incomplete: false,
      fight: {
        userId: "u1",
        atk: 1_234,
        precision: 0.82,
        pillStatus: "active",
      },
      display: {
        avatarUrl: "https://example.test/u1.png",
        militaryRankBonus: 0.35,
        ammoLabel: "Q5",
        pillLabel: "cocain",
        pillEndsAt: "2026-09-15T13:00:00.000Z",
        skillLevels: { attack: 11, health: 9 },
        lastSkillsResetAt: "2026-09-01T00:00:00.000Z",
      },
    });
    expect(requestBatch).not.toHaveBeenCalled();
  });

  it("live-fills a watched MU when no fight snapshots exist", async () => {
    await seedMu(db, ["u1"], true);
    const requestBatch = vi.fn(async () => [{ ok: true as const, data: rawFight("u1") }]);
    const { app } = appFor(db, requestBatch);

    const res = await app.request("http://localhost/mu-1/fight-desk");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      asOf: string | null;
      members: Array<{ incomplete: boolean }>;
      meta: {
        watched: boolean;
        liveFilled: boolean;
        refreshFailedUserIds: string[];
      };
    };
    expect(body.asOf).toBe(NOW.toISOString());
    expect(body.members[0]?.incomplete).toBe(false);
    expect(body.meta).toEqual({
      watched: true,
      liveFilled: true,
      refreshFailedUserIds: [],
    });
    expect(await db.select().from(schema.userFightSnapshots)).toHaveLength(1);
  });

  it("force-refreshes the roster, stores valid snapshots, and returns partial data", async () => {
    await seedMu(db, ["u1", "u2"]);
    const requestBatch = vi.fn(async () => [
      { ok: true as const, data: rawFight("u1") },
      { ok: true as const, data: { _id: "u2", username: "missing-fight-fields" } },
    ]);
    const { app } = appFor(db, requestBatch);

    const res = await app.request("http://localhost/mu-1/fight-desk/refresh", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      asOf: string | null;
      members: Array<{ userId: string; incomplete: boolean; refreshFailed?: boolean }>;
      meta: {
        watched: boolean;
        liveFilled: boolean;
        refreshFailedUserIds: string[];
      };
    };
    expect(body.asOf).toBe(NOW.toISOString());
    expect(body.meta).toEqual({
      watched: false,
      liveFilled: true,
      refreshFailedUserIds: ["u2"],
    });
    expect(body.members).toMatchObject([
      { userId: "u1", incomplete: false },
      { userId: "u2", incomplete: true, refreshFailed: true },
    ]);
    expect(requestBatch).toHaveBeenCalledWith([
      { procedure: "user.getUserById", input: { userId: "u1" } },
      { procedure: "user.getUserById", input: { userId: "u2" } },
    ]);
    expect(await db.select().from(schema.userFightSnapshots)).toHaveLength(1);
    expect(await db.select().from(schema.userFightPolls)).toHaveLength(1);
  });

  it("keeps an existing snapshot and marks the member when forced refresh fails", async () => {
    await seedMu(db, ["u1"]);
    const oldAt = new Date("2026-09-15T11:55:00.000Z");
    const pollId = await insertUserFightPoll(db, {
      recordedAt: oldAt,
      status: "success",
      userCount: 1,
      muCount: 1,
    });
    await insertUserFightSnapshots(db, pollId, [
      { ...parsedFight("u1", "alice"), muId: "mu-1", recordedAt: oldAt },
    ]);
    const requestBatch = vi.fn(async () => [
      { ok: true as const, data: { _id: "u1", username: "missing-fight-fields" } },
    ]);
    const { app } = appFor(db, requestBatch);

    const res = await app.request("http://localhost/mu-1/fight-desk/refresh", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      members: Array<{
        userId: string;
        incomplete: boolean;
        refreshFailed?: boolean;
        fight: unknown;
      }>;
      meta: {
        liveFilled: boolean;
        refreshFailedUserIds: string[];
      };
    };
    expect(body.meta.liveFilled).toBe(true);
    expect(body.meta.refreshFailedUserIds).toEqual(["u1"]);
    expect(body.members[0]).toMatchObject({
      userId: "u1",
      incomplete: false,
      refreshFailed: true,
      fight: {
        userId: "u1",
        atk: 1_234,
        precision: 0.82,
        pillStatus: "active",
      },
    });
    expect(await db.select().from(schema.userFightSnapshots)).toHaveLength(1);
  });
});
