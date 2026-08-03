import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import { listMuMembers } from "../../db/mus";
import * as schema from "../../db/schema";
import { SEED_MU_ID } from "../../warera/mu";
import { runMuStatsPoll } from "./run";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "mu-poll-"));
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
  beforeEach(async () => {
    db = await createDb();
  });

  it("seeds watchlist, upserts current rows, and writes snapshots", async () => {
    const warera = {
      request: vi.fn(async (path: string) => {
        if (path.includes("muMember.getByMu")) {
          return { result: { data: memberFixture } };
        }
        if (path.includes("mu.getById")) {
          return { result: { data: muFixture } };
        }
        throw new Error(`unexpected path ${path}`);
      }),
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
    };
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

  it("marks partial when member fetch fails but still writes MU snapshot", async () => {
    const warera = {
      request: vi.fn(async (path: string) => {
        if (path.includes("muMember.getByMu")) throw new Error("members down");
        if (path.includes("mu.getById")) return { result: { data: muFixture } };
        throw new Error(`unexpected path ${path}`);
      }),
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
    };
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
});
