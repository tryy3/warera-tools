import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "./client";
import * as schema from "./schema";
import {
  ensureSeedMu,
  listMuMembers,
  listMusForSync,
  replaceMuMembers,
  upsertMuCurrent,
} from "./mus";
import { SEED_MU_ID, type ParsedMu } from "../warera/mu";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "mus-"));
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
  return drizzle(client, { schema });
}

function sampleMu(overrides: Partial<ParsedMu> = {}): ParsedMu {
  return {
    id: SEED_MU_ID,
    name: "Sweed Liberty",
    avatarUrl: null,
    countryId: "c1",
    regionId: "r1",
    ownerUserId: "owner1",
    mercenaryReputation: 1,
    level: 1,
    createdAtGame: new Date("2026-04-20T07:56:38.148Z"),
    memberUserIds: ["u1", "owner1"],
    roles: { managers: [], commanders: ["u1"] },
    activeUpgradeLevels: { headquarters: 4 },
    payload: null,
    stats: {
      weeklyDamages: 1,
      weeklyDamagesRank: 1,
      weeklyDamagesTier: "gold",
      bounty: 1,
      bountyRank: 1,
      bountyTier: "gold",
      reputation: 1,
      reputationRank: 1,
      reputationTier: "gold",
      damages: 1,
      damagesRank: 1,
      damagesTier: "gold",
      terrain: 1,
      terrainRank: 1,
      terrainTier: "gold",
      wealth: 1,
      wealthRank: 1,
      wealthTier: "gold",
      levelingLevel: 1,
      levelingMonthlyDamages: 0,
    },
    ...overrides,
  };
}

describe("mus db", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
  });

  it("seeds watchlist when empty", async () => {
    expect(await listMusForSync(db)).toEqual([]);
    await ensureSeedMu(db, new Date("2026-08-03T00:00:00.000Z"));
    expect(await listMusForSync(db)).toEqual([{ id: SEED_MU_ID }]);
    await ensureSeedMu(db);
    expect(await listMusForSync(db)).toHaveLength(1);
  });

  it("upserts current MU and replaces roster", async () => {
    await ensureSeedMu(db);
    const t = new Date("2026-08-03T12:00:00.000Z");
    await upsertMuCurrent(db, sampleMu(), t);
    await replaceMuMembers(
      db,
      SEED_MU_ID,
      [
        { userId: "u1", role: "commander" },
        { userId: "owner1", role: "owner" },
      ],
      t,
    );
    expect(await listMuMembers(db, SEED_MU_ID)).toEqual([
      { userId: "owner1", role: "owner" },
      { userId: "u1", role: "commander" },
    ]);
    await replaceMuMembers(db, SEED_MU_ID, [{ userId: "u2", role: "member" }], t);
    expect(await listMuMembers(db, SEED_MU_ID)).toEqual([{ userId: "u2", role: "member" }]);
  });
});
