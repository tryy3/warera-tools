import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import { createTestDb, truncateAllTables } from "../../db/test/postgres";
import type { Logger } from "../../logging/logger";
import type { PlayerBattlesResponse } from "../../player-battles/types";
import { errorPayload } from "../errors";
import { playerBattlesRoutes } from "./player-battles";

const silentLogger = {
  silly: () => {},
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => silentLogger,
} as unknown as Logger;

const battle = (id: string, roundId: string) => ({
  _id: id,
  isActive: true,
  attacker: { country: "c-a", region: "r1" },
  defender: { country: "c-d", region: "r1" },
  currentRound: {
    _id: roundId,
    number: 3,
    isActive: true,
    live: { nextTickAt: "2026-10-09T15:07:00.510Z" },
  },
});

const rankRow = (rank: number, user: string, value: number, code?: string) => ({
  rank,
  user,
  value,
  ...(code ? { lootItem: { code } } : {}),
});

function rankingFor(path: string) {
  const input = JSON.parse(new URL(`http://x/${path}`).searchParams.get("input")!);
  const scope = input.roundId ? "round" : "battle";
  if (input.side === "attacker") {
    return [rankRow(1, "other", scope === "round" ? 500 : 5000, "helmet4")];
  }
  return scope === "round"
    ? [rankRow(1, "boss", 300, "chest3"), rankRow(2, "me", 100, "gun")]
    : [rankRow(1, "boss", 3000, "pants3"), rankRow(2, "me", 1000, "gun")];
}

function requester() {
  return vi.fn(async (path: string) => {
    if (path.startsWith("battle.getBattles")) {
      return { result: { data: { items: [battle("b1", "r-b1"), battle("b2", "r-b2")] } } };
    }
    if (path.startsWith("battleLootSummary.getByBattleAndUser")) {
      const input = JSON.parse(new URL(`http://x/${path}`).searchParams.get("input")!);
      if (input.battleId !== "b1" || input.userId !== "me")
        throw new Error("WarEra request failed: 404 NOT_FOUND");
      return { result: { data: { totalDmg: 1200, hits: 7, case1Count: 2, case2Count: 1 } } };
    }
    if (path.startsWith("battleRanking.getRanking")) {
      return { result: { data: { items: rankingFor(path), itemCount: 2 } } };
    }
    throw new Error(`unexpected warera call: ${path}`);
  });
}

function appFor(db: Db, request: ReturnType<typeof requester>) {
  const app = new Hono();
  app.onError((err, c) => {
    const { status, body } = errorPayload(err);
    return c.json(body, status as ContentfulStatusCode);
  });
  app.route("/", playerBattlesRoutes({ db, warera: { request } as never, logger: silentLogger }));
  return app;
}

describe("GET /api/player-battles", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("400s without userId", async () => {
    const res = await appFor(db, requester()).request("http://localhost/");
    expect(res.status).toBe(400);
  });

  it("returns only battles the user fought, with ladders and held tally", async () => {
    const res = await appFor(db, requester()).request("http://localhost/?userId=me");
    expect(res.status).toBe(200);
    const body = (await res.json()) as PlayerBattlesResponse;
    expect(body.live).toBe(true);
    expect(body.battles.map((b) => b.battleId)).toEqual(["b1"]);
    const b = body.battles[0]!;
    expect(b).toMatchObject({
      mySide: "defender",
      roundNumber: 3,
      totalDamage: 1200,
      case1Count: 2,
      nextTickAt: "2026-10-09T15:07:00.510Z",
    });
    const round = b.ladders.find((l) => l.scope === "round")!;
    expect(round).toMatchObject({ side: "defender", myRank: 2, myDamage: 100 });
    expect(round.current).toMatchObject({ tier: "green", kind: "weapon" });
    expect(round.nextTier).toMatchObject({
      rank: 1,
      tier: "blue",
      kind: "chest",
      damageNeeded: 201,
    });
    const battleScope = b.ladders.find((l) => l.scope === "battle")!;
    // live summary damage 1200 against the holder's 3000
    expect(battleScope.targets[0]).toMatchObject({ damageNeeded: 1801 });
    expect(body.held).toEqual([{ tier: "green", kind: "weapon", count: 2 }]);
  });

  it("serves the second call from cache until refresh=1", async () => {
    const request = requester();
    const app = appFor(db, request);
    await app.request("http://localhost/?userId=me");
    const calls = request.mock.calls.length;
    const cached = (await (
      await app.request("http://localhost/?userId=me")
    ).json()) as PlayerBattlesResponse;
    expect(cached.live).toBe(false);
    expect(request.mock.calls.length).toBe(calls);
    const fresh = (await (
      await app.request("http://localhost/?userId=me&refresh=1")
    ).json()) as PlayerBattlesResponse;
    expect(fresh.live).toBe(true);
    expect(request.mock.calls.length).toBeGreaterThan(calls);
  });

  it("returns an empty list for a user in no active battle", async () => {
    const res = await appFor(db, requester()).request("http://localhost/?userId=idle");
    const body = (await res.json()) as PlayerBattlesResponse;
    expect(body.battles).toEqual([]);
    expect(body.held).toEqual([]);
  });

  it("502s when WarEra fails", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.startsWith("battle.getBattles")) {
        return { result: { data: { items: [battle("b1", "r1")] } } };
      }
      throw new Error("WarEra request failed: 502");
    });
    const res = await appFor(db, request as never).request("http://localhost/?userId=me");
    expect(res.status).toBe(502);
  });
});
