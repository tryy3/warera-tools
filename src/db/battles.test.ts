import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { ParsedBattle } from "../warera/battles";
import type { Db } from "./client";
import { createTestDb, truncateAllTables } from "./test/postgres";
import {
  listActiveTrackedBattles,
  markBattleEnded,
  markBattleFinalized,
  mergeStickyMuIds,
  upsertBattleFromParsed,
} from "./battles";
import * as schema from "./schema";

function sampleBattle(overrides: Partial<ParsedBattle> = {}): ParsedBattle {
  return {
    id: "b1",
    warId: "w1",
    type: "war",
    isActive: true,
    attacker: {
      countryId: "c-att",
      regionId: "r-att",
      wonRoundsCount: 1,
      muOrders: ["mu-a"],
      countryOrders: [],
      hitCount: 10,
    },
    defender: {
      countryId: "c-def",
      regionId: "r-def",
      wonRoundsCount: 0,
      muOrders: ["mu-b"],
      countryOrders: [],
      hitCount: 8,
    },
    roundsToWin: 8,
    rounds: ["round-1"],
    roundsHistory: [{ round: 1 }],
    startedAtGame: new Date("2026-09-01T00:00:00.000Z"),
    currentRound: {
      id: "round-1",
      number: 3,
      isActive: true,
      attackerDamages: 1000,
      defenderDamages: 800,
      attackerPoints: 50,
      defenderPoints: 40,
      live: { ticksCount: 12, nextTickAt: new Date("2026-09-01T00:05:00.000Z") },
      createdAt: new Date("2026-09-01T00:01:00.000Z"),
    },
    payload: { extra: true },
    ...overrides,
  };
}

describe("battles db", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("upserts then lists only active tracked battles", async () => {
    const fetchedAt = new Date("2026-09-03T12:00:00.000Z");
    await upsertBattleFromParsed(db, sampleBattle(), {
      stickyMuIds: ["mu-a"],
      fetchedAt,
    });
    await upsertBattleFromParsed(db, sampleBattle({ id: "b2" }), {
      stickyMuIds: ["mu-b"],
      fetchedAt,
    });
    await markBattleFinalized(db, "b2", fetchedAt);

    const active = await listActiveTrackedBattles(db);
    expect(active.map((r) => r.id)).toEqual(["b1"]);
    expect(active[0]?.warId).toBe("w1");
    expect(active[0]?.attackerCountryId).toBe("c-att");
    expect(active[0]?.currentRoundId).toBe("round-1");
    expect(active[0]?.currentRoundNumber).toBe(3);
    expect(active[0]?.attackerWonRounds).toBe(1);
    expect(active[0]?.attackerMuOrders).toEqual(["mu-a"]);
    expect(active[0]?.stickyMuIds).toEqual(["mu-a"]);
  });

  it("merges sticky MU ids as sorted unique and does not drop old ones when orders change", async () => {
    expect(mergeStickyMuIds(["mu-b", "mu-a"], ["mu-c", "mu-a"])).toEqual(["mu-a", "mu-b", "mu-c"]);
    expect(mergeStickyMuIds(null, ["mu-z", "mu-a"])).toEqual(["mu-a", "mu-z"]);

    const fetchedAt = new Date("2026-09-03T12:00:00.000Z");
    await upsertBattleFromParsed(db, sampleBattle(), {
      stickyMuIds: ["mu-b", "mu-a"],
      fetchedAt,
    });
    await upsertBattleFromParsed(
      db,
      sampleBattle({
        attacker: {
          countryId: "c-att",
          regionId: "r-att",
          wonRoundsCount: 2,
          muOrders: [],
          countryOrders: [],
          hitCount: 11,
        },
        defender: {
          countryId: "c-def",
          regionId: "r-def",
          wonRoundsCount: 1,
          muOrders: ["mu-c"],
          countryOrders: [],
          hitCount: 9,
        },
      }),
      { stickyMuIds: ["mu-c"], fetchedAt: new Date("2026-09-03T12:15:00.000Z") },
    );

    const [row] = await db.select().from(schema.battles).where(eq(schema.battles.id, "b1"));
    expect(row?.stickyMuIds).toEqual(["mu-a", "mu-b", "mu-c"]);
    expect(row?.attackerMuOrders).toEqual([]);
    expect(row?.defenderMuOrders).toEqual(["mu-c"]);
    expect(row?.attackerWonRounds).toBe(2);
  });

  it("markBattleEnded does not overwrite an existing ended_at", async () => {
    const fetchedAt = new Date("2026-09-03T12:00:00.000Z");
    const firstEnded = new Date("2026-09-03T12:10:00.000Z");
    const secondEnded = new Date("2026-09-03T12:20:00.000Z");
    await upsertBattleFromParsed(db, sampleBattle(), { stickyMuIds: ["mu-a"], fetchedAt });
    await markBattleEnded(db, "b1", firstEnded);
    await markBattleEnded(db, "b1", secondEnded);

    const [row] = await db.select().from(schema.battles).where(eq(schema.battles.id, "b1"));
    expect(row?.endedAt).toEqual(firstEnded);
    expect(row?.isActive).toBe(true);
  });

  it("upsert does not clear ended_at or finalized_at unless explicitly passed", async () => {
    const fetchedAt = new Date("2026-09-03T12:00:00.000Z");
    const endedAt = new Date("2026-09-03T12:10:00.000Z");
    await upsertBattleFromParsed(db, sampleBattle(), { stickyMuIds: ["mu-a"], fetchedAt });
    await markBattleEnded(db, "b1", endedAt);
    await upsertBattleFromParsed(db, sampleBattle({ warId: "w2" }), {
      stickyMuIds: ["mu-a"],
      fetchedAt: new Date("2026-09-03T12:15:00.000Z"),
    });

    const [row] = await db.select().from(schema.battles).where(eq(schema.battles.id, "b1"));
    expect(row?.warId).toBe("w2");
    expect(row?.endedAt).toEqual(endedAt);
    expect(row?.finalizedAt).toBeNull();
  });

  it("markBattleFinalized clears is_active", async () => {
    const fetchedAt = new Date("2026-09-03T12:00:00.000Z");
    const finalizedAt = new Date("2026-09-03T12:16:00.000Z");
    await upsertBattleFromParsed(db, sampleBattle(), { stickyMuIds: ["mu-a"], fetchedAt });
    await markBattleFinalized(db, "b1", finalizedAt);

    const [row] = await db.select().from(schema.battles).where(eq(schema.battles.id, "b1"));
    expect(row?.isActive).toBe(false);
    expect(row?.finalizedAt).toEqual(finalizedAt);
    expect(await listActiveTrackedBattles(db)).toEqual([]);
  });
});
