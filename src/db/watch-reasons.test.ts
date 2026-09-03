import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "./client";
import * as schema from "./schema";
import { countryWatchReasons, muWatchReasons, playerWatchReasons } from "./schema";
import {
  MANUAL_SOURCE_ID,
  SEED_COUNTRY_SWEDEN_ID,
  WATCH_REASON_FOLLOW_PLAYER,
  WATCH_REASON_MANUAL,
  deleteCountryWatchReason,
  deleteFollowPlayerReasonsForSource,
  deleteMuWatchReason,
  deletePlayerWatchReason,
  ensureSwedenCountryWatchReason,
  insertCountryWatchReason,
  insertMuWatchReason,
  insertPlayerWatchReason,
  listDistinctFollowedPlayerIds,
  listDistinctWatchedCountryIds,
  listDistinctWatchedMuIds,
  listMuWatchReasons,
  reconcileFollowPlayerMu,
} from "./watch-reasons";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "watch-reasons-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE player_watch_reasons (
      player_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      source_id TEXT NOT NULL,
      last_touched_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (player_id, reason, source_id)
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
    CREATE TABLE country_watch_reasons (
      country_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      source_id TEXT NOT NULL,
      last_touched_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (country_id, reason, source_id)
    )
  `);
  return drizzle(client, { schema });
}

async function countPlayerRows(db: Db): Promise<number> {
  const rows = await db.select({ id: playerWatchReasons.playerId }).from(playerWatchReasons);
  return rows.length;
}

async function countMuRows(db: Db): Promise<number> {
  const rows = await db.select({ id: muWatchReasons.muId }).from(muWatchReasons);
  return rows.length;
}

async function muRowsForMu(db: Db, muId: string) {
  return db
    .select({
      muId: muWatchReasons.muId,
      reason: muWatchReasons.reason,
      sourceId: muWatchReasons.sourceId,
    })
    .from(muWatchReasons)
    .where(eq(muWatchReasons.muId, muId))
    .orderBy(muWatchReasons.sourceId, muWatchReasons.reason);
}

describe("watch-reasons db", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
  });

  it("lists distinct followed player ids sorted by id", async () => {
    const at = new Date("2026-08-21T00:00:00.000Z");
    await insertPlayerWatchReason(db, {
      playerId: "playerB",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });
    await insertPlayerWatchReason(db, {
      playerId: "playerA",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });
    expect(await listDistinctFollowedPlayerIds(db)).toEqual(["playerA", "playerB"]);
  });

  it("duplicate insert is idempotent", async () => {
    const at = new Date("2026-08-21T00:00:00.000Z");
    await insertPlayerWatchReason(db, {
      playerId: "p1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });
    await insertPlayerWatchReason(db, {
      playerId: "p1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });
    expect(await countPlayerRows(db)).toBe(1);
  });

  it("lists distinct watched MU ids", async () => {
    const at = new Date("2026-08-21T00:00:00.000Z");
    await insertMuWatchReason(db, {
      muId: "mu1",
      reason: WATCH_REASON_FOLLOW_PLAYER,
      sourceId: "p1",
      at,
    });
    await insertMuWatchReason(db, {
      muId: "mu1",
      reason: WATCH_REASON_FOLLOW_PLAYER,
      sourceId: "p2",
      at,
    });
    await insertMuWatchReason(db, {
      muId: "mu2",
      reason: WATCH_REASON_FOLLOW_PLAYER,
      sourceId: "p1",
      at,
    });
    expect(await listDistinctWatchedMuIds(db)).toEqual(["mu1", "mu2"]);
  });

  it("reconcileFollowPlayerMu moves player from MU-1 to MU-2 keeping manual rows", async () => {
    const at = new Date("2026-08-21T00:00:00.000Z");
    // Player p1 follows into mu1
    await insertMuWatchReason(db, {
      muId: "mu1",
      reason: WATCH_REASON_FOLLOW_PLAYER,
      sourceId: "p1",
      at,
    });
    // A manual watch on mu1 from a different source stays
    await insertMuWatchReason(db, {
      muId: "mu1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });

    // Move p1 to mu2
    await reconcileFollowPlayerMu(db, { playerId: "p1", muId: "mu2", at });

    const mu1Rows = await muRowsForMu(db, "mu1");
    expect(mu1Rows).toEqual([
      { muId: "mu1", reason: WATCH_REASON_MANUAL, sourceId: MANUAL_SOURCE_ID },
    ]);
    const mu2Rows = await muRowsForMu(db, "mu2");
    expect(mu2Rows).toEqual([{ muId: "mu2", reason: WATCH_REASON_FOLLOW_PLAYER, sourceId: "p1" }]);
  });

  it("reconcileFollowPlayerMu with null muId deletes that source's follow rows only", async () => {
    const at = new Date("2026-08-21T00:00:00.000Z");
    await insertMuWatchReason(db, {
      muId: "mu1",
      reason: WATCH_REASON_FOLLOW_PLAYER,
      sourceId: "p1",
      at,
    });
    await insertMuWatchReason(db, {
      muId: "mu1",
      reason: WATCH_REASON_FOLLOW_PLAYER,
      sourceId: "p2",
      at,
    });

    await reconcileFollowPlayerMu(db, { playerId: "p1", muId: null, at });

    const mu1Rows = await muRowsForMu(db, "mu1");
    expect(mu1Rows).toEqual([{ muId: "mu1", reason: WATCH_REASON_FOLLOW_PLAYER, sourceId: "p2" }]);
  });

  it("deletePlayerWatchReason does not touch MU reasons", async () => {
    const at = new Date("2026-08-21T00:00:00.000Z");
    await insertPlayerWatchReason(db, {
      playerId: "p1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });
    await insertMuWatchReason(db, {
      muId: "mu1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });

    await deletePlayerWatchReason(db, {
      playerId: "p1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
    });

    expect(await countPlayerRows(db)).toBe(0);
    expect(await countMuRows(db)).toBe(1);
  });

  it("deleteMuWatchReason removes only the matching row", async () => {
    const at = new Date("2026-08-21T00:00:00.000Z");
    await insertMuWatchReason(db, {
      muId: "mu1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });
    await insertMuWatchReason(db, {
      muId: "mu1",
      reason: WATCH_REASON_FOLLOW_PLAYER,
      sourceId: "p1",
      at,
    });

    await deleteMuWatchReason(db, {
      muId: "mu1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
    });

    const rows = await muRowsForMu(db, "mu1");
    expect(rows).toEqual([{ muId: "mu1", reason: WATCH_REASON_FOLLOW_PLAYER, sourceId: "p1" }]);
  });

  it("listMuWatchReasons returns reasons for the MU", async () => {
    const at = new Date("2026-08-21T00:00:00.000Z");
    await insertMuWatchReason(db, {
      muId: "mu1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });
    await insertMuWatchReason(db, {
      muId: "mu1",
      reason: WATCH_REASON_FOLLOW_PLAYER,
      sourceId: "p1",
      at,
    });
    await insertMuWatchReason(db, {
      muId: "mu2",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });

    const reasons = await listMuWatchReasons(db, "mu1");
    expect(reasons).toHaveLength(2);
    expect(reasons).toContainEqual({ reason: WATCH_REASON_MANUAL, sourceId: MANUAL_SOURCE_ID });
    expect(reasons).toContainEqual({ reason: WATCH_REASON_FOLLOW_PLAYER, sourceId: "p1" });
  });

  it("deleteFollowPlayerReasonsForSource removes all follow_player rows for that source", async () => {
    const at = new Date("2026-08-21T00:00:00.000Z");
    await insertMuWatchReason(db, {
      muId: "mu1",
      reason: WATCH_REASON_FOLLOW_PLAYER,
      sourceId: "p1",
      at,
    });
    await insertMuWatchReason(db, {
      muId: "mu2",
      reason: WATCH_REASON_FOLLOW_PLAYER,
      sourceId: "p1",
      at,
    });
    await insertMuWatchReason(db, {
      muId: "mu1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });

    await deleteFollowPlayerReasonsForSource(db, "p1");

    expect(await countMuRows(db)).toBe(1);
    const rows = await muRowsForMu(db, "mu1");
    expect(rows).toEqual([
      { muId: "mu1", reason: WATCH_REASON_MANUAL, sourceId: MANUAL_SOURCE_ID },
    ]);
  });

  it("lists distinct watched country ids sorted by id", async () => {
    const at = new Date("2026-09-03T00:00:00.000Z");
    await insertCountryWatchReason(db, {
      countryId: "cB",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });
    await insertCountryWatchReason(db, {
      countryId: "cA",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });
    await insertCountryWatchReason(db, {
      countryId: "cA",
      reason: "mu_home",
      sourceId: "mu1",
      at,
    });
    expect(await listDistinctWatchedCountryIds(db)).toEqual(["cA", "cB"]);
  });

  it("country duplicate insert is idempotent", async () => {
    const at = new Date("2026-09-03T00:00:00.000Z");
    const row = {
      countryId: "c1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    };
    await insertCountryWatchReason(db, row);
    await insertCountryWatchReason(db, row);
    const rows = await db.select().from(countryWatchReasons);
    expect(rows).toHaveLength(1);
  });

  it("ensureSwedenCountryWatchReason inserts seed once", async () => {
    const at = new Date("2026-09-03T00:00:00.000Z");
    await ensureSwedenCountryWatchReason(db, at);
    await ensureSwedenCountryWatchReason(db, at);
    expect(await listDistinctWatchedCountryIds(db)).toEqual([SEED_COUNTRY_SWEDEN_ID]);
  });

  it("deleteCountryWatchReason removes only the matching row", async () => {
    const at = new Date("2026-09-03T00:00:00.000Z");
    await insertCountryWatchReason(db, {
      countryId: "c1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });
    await insertCountryWatchReason(db, {
      countryId: "c1",
      reason: "mu_home",
      sourceId: "mu1",
      at,
    });
    await deleteCountryWatchReason(db, {
      countryId: "c1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
    });
    expect(await listDistinctWatchedCountryIds(db)).toEqual(["c1"]);
    const left = await db.select().from(countryWatchReasons);
    expect(left).toHaveLength(1);
    expect(left[0]?.reason).toBe("mu_home");
  });
});
