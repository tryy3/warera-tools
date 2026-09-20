import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { ParsedBattleOrder } from "../warera/battle-orders";
import type { Db } from "./client";
import { listBattleOrders, replaceBattleOrders } from "./battle-orders";
import { upsertBattleFromParsed } from "./battles";
import * as schema from "./schema";
import { createTestDb, truncateAllTables } from "./test/postgres";
import type { ParsedBattle } from "../warera/battles";

function minimalBattle(id: string): ParsedBattle {
  return {
    id,
    warId: "w1",
    type: "war",
    isActive: true,
    attacker: {
      countryId: "c1",
      regionId: "r1",
      wonRoundsCount: 0,
      muOrders: [],
      countryOrders: [],
      hitCount: null,
    },
    defender: {
      countryId: "c2",
      regionId: "r2",
      wonRoundsCount: 0,
      muOrders: [],
      countryOrders: [],
      hitCount: null,
    },
    roundsToWin: 8,
    rounds: [],
    roundsHistory: [],
    startedAtGame: null,
    currentRound: null,
    payload: null,
  };
}

describe("battle orders db", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("replaceBattleOrders then listBattleOrders round-trips without payload", async () => {
    const fetchedAt = new Date("2026-09-10T12:00:00.000Z");
    await upsertBattleFromParsed(db, minimalBattle("b-orders"), {
      stickyMuIds: [],
      fetchedAt,
    });

    const orders: ParsedBattleOrder[] = [
      {
        ownerType: "mu",
        ownerId: "mu-1",
        side: "attacker",
        priority: "high",
        payload: { keep: false },
      },
      {
        ownerType: "country",
        ownerId: "sweden",
        side: "defender",
        priority: "medium",
        payload: null,
      },
    ];
    await replaceBattleOrders(db, "b-orders", orders, fetchedAt);

    const listed = await listBattleOrders(db, "b-orders");
    expect(listed).toEqual([
      {
        ownerType: "mu",
        ownerId: "mu-1",
        side: "attacker",
        priority: "high",
        payload: null,
      },
      {
        ownerType: "country",
        ownerId: "sweden",
        side: "defender",
        priority: "medium",
        payload: null,
      },
    ]);
  });

  it("empty replace clears orders for the battle", async () => {
    const fetchedAt = new Date("2026-09-10T12:00:00.000Z");
    await upsertBattleFromParsed(db, minimalBattle("b-clear"), {
      stickyMuIds: [],
      fetchedAt,
    });
    await replaceBattleOrders(
      db,
      "b-clear",
      [
        {
          ownerType: "mu",
          ownerId: "mu-1",
          side: "attacker",
          priority: "high",
          payload: null,
        },
      ],
      fetchedAt,
    );
    await replaceBattleOrders(db, "b-clear", [], fetchedAt);
    expect(await listBattleOrders(db, "b-clear")).toEqual([]);
  });

  it("PK is one row per (battle, owner_type, owner_id)", async () => {
    const fetchedAt = new Date("2026-09-10T12:00:00.000Z");
    await upsertBattleFromParsed(db, minimalBattle("b-pk"), { stickyMuIds: [], fetchedAt });
    await replaceBattleOrders(
      db,
      "b-pk",
      [
        {
          ownerType: "mu",
          ownerId: "mu-same",
          side: "attacker",
          priority: "low",
          payload: null,
        },
      ],
      fetchedAt,
    );
    await replaceBattleOrders(
      db,
      "b-pk",
      [
        {
          ownerType: "mu",
          ownerId: "mu-same",
          side: "defender",
          priority: "high",
          payload: null,
        },
      ],
      new Date("2026-09-10T13:00:00.000Z"),
    );

    const rows = await db
      .select()
      .from(schema.battleOrders)
      .where(eq(schema.battleOrders.battleId, "b-pk"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.side).toBe("defender");
    expect(rows[0]?.priority).toBe("high");
  });
});
