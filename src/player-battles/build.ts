import { inArray } from "drizzle-orm";
import {
  resolveBattleLadders,
  type BattleRankings,
  type ScopeRankings,
  type SideRanking,
} from "../battle-loot/battle";
import { tallyLoot, type LootTallyKey } from "../battle-loot/ladder";
import type { Db } from "../db/client";
import { classifyCacheLookup, getCachedRow, recordCacheLookup, setCached } from "../db/cache";
import { countries, regions } from "../db/schema";
import type { Logger } from "../logging/logger";
import {
  fetchAllActiveBattles,
  fetchBattleLootSummaries,
  type ParsedBattle,
} from "../warera/battles";
import {
  fetchDamageRankings,
  type BattleSideId,
  type DamageRanking,
  type RankingScope,
  type RankingTarget,
} from "../warera/battle-ranking";
import type { WareraRequester } from "../warera/prices";
import type { PlayerBattleView, PlayerBattlesResponse } from "./types";

/** Rankings only move on round ticks (~2 min), so a minute keeps the page live without hammering api2. */
export const PLAYER_BATTLES_TTL_SECONDS = 60;

export function playerBattlesCacheKey(userId: string): string {
  return `player-battles:v1:${userId}`;
}

function toSideRanking(result: DamageRanking): SideRanking {
  return {
    complete: result.complete,
    rows: result.rows.map((r) => ({
      rank: r.rank,
      userId: r.userId,
      value: r.value,
      itemCode: r.lootItemCode,
    })),
  };
}

const SIDES = ["attacker", "defender"] as const satisfies readonly BattleSideId[];

function scopesOf(battle: ParsedBattle): RankingScope[] {
  const roundId = battle.currentRound?.id ?? null;
  return [
    ...(roundId ? [{ kind: "round", roundId } as const] : []),
    { kind: "battle", battleId: battle.id },
  ];
}

/** One batched walk for every battle, so call count does not grow with the number of battles. */
async function fetchAllRankings(
  warera: WareraRequester,
  battles: readonly ParsedBattle[],
): Promise<BattleRankings[]> {
  const plan = battles.map(scopesOf);
  const targets: RankingTarget[] = plan.flatMap((scopes) =>
    scopes.flatMap((scope) => SIDES.map((side) => ({ scope, side }))),
  );
  const results = (await fetchDamageRankings(warera, targets)).map(toSideRanking);
  let at = 0;
  return plan.map((scopes) => {
    const byScope = new Map<RankingScope["kind"], ScopeRankings>();
    for (const scope of scopes) {
      byScope.set(scope.kind, { attacker: results[at]!, defender: results[at + 1]! });
      at += SIDES.length;
    }
    return { round: byScope.get("round") ?? null, battle: byScope.get("battle")! };
  });
}

type Names = {
  regions: Map<string, string | null>;
  countries: Map<string, { name: string; isoCode: string | null }>;
};

async function loadNames(db: Db, battles: readonly ParsedBattle[]): Promise<Names> {
  const regionIds = new Set<string>();
  const countryIds = new Set<string>();
  for (const b of battles) {
    for (const side of [b.attacker, b.defender]) {
      if (side.regionId) regionIds.add(side.regionId);
      if (side.countryId) countryIds.add(side.countryId);
    }
  }
  const [regionRows, countryRows] = await Promise.all([
    regionIds.size
      ? db
          .select()
          .from(regions)
          .where(inArray(regions.id, [...regionIds]))
      : Promise.resolve([]),
    countryIds.size
      ? db
          .select()
          .from(countries)
          .where(inArray(countries.id, [...countryIds]))
      : Promise.resolve([]),
  ]);
  return {
    regions: new Map(regionRows.map((r) => [r.id, r.name])),
    countries: new Map(countryRows.map((c) => [c.id, { name: c.name, isoCode: c.isoCode }])),
  };
}

async function buildLive(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
  userId: string;
}): Promise<PlayerBattlesResponse> {
  const { db, warera, logger, userId } = options;
  const started = Date.now();
  const { battles: active, complete } = await fetchAllActiveBattles(warera);
  if (!complete) {
    logger.warn(
      { user_id: userId, active_battle_count: active.length },
      "active battle walk incomplete",
    );
  }

  const lootByBattle = await fetchBattleLootSummaries(
    warera,
    active.map((b) => b.id),
    userId,
  );
  const fought = active.flatMap((battle) => {
    const loot = lootByBattle.get(battle.id) ?? null;
    return loot ? [{ battle, loot }] : [];
  });

  const foughtBattles = fought.map((f) => f.battle);
  const [names, rankingsByBattle] = await Promise.all([
    loadNames(db, foughtBattles),
    fetchAllRankings(warera, foughtBattles),
  ]);

  const views: PlayerBattleView[] = fought.map(({ battle, loot }, i): PlayerBattleView => {
    const { mySide, ladders } = resolveBattleLadders(rankingsByBattle[i]!, userId, loot.totalDmg);
    const attackerCountry = battle.attacker.countryId
      ? names.countries.get(battle.attacker.countryId)
      : undefined;
    const defenderCountry = battle.defender.countryId
      ? names.countries.get(battle.defender.countryId)
      : undefined;
    const regionId = battle.defender.regionId ?? battle.attacker.regionId;
    return {
      battleId: battle.id,
      regionName: regionId ? (names.regions.get(regionId) ?? null) : null,
      attackerCountryName: attackerCountry?.name ?? null,
      defenderCountryName: defenderCountry?.name ?? null,
      attackerIsoCode: attackerCountry?.isoCode ?? null,
      defenderIsoCode: defenderCountry?.isoCode ?? null,
      roundNumber: battle.currentRound?.number ?? null,
      nextTickAt: battle.currentRound?.live?.nextTickAt?.toISOString() ?? null,
      mySide,
      totalDamage: loot.totalDmg,
      hits: loot.hits,
      case1Count: loot.case1Count,
      case2Count: loot.case2Count,
      ladders,
    };
  });

  const held: LootTallyKey[] = views
    .filter((v) => v.mySide != null)
    .flatMap((v) => v.ladders.flatMap((l) => (l.current ? [l.current] : [])));

  logger.info(
    {
      user_id: userId,
      active_battle_count: active.length,
      fought_battle_count: views.length,
      held_item_count: held.length,
      duration_ms: Date.now() - started,
    },
    "player battles built",
  );

  return {
    userId,
    fetchedAt: new Date().toISOString(),
    live: true,
    battlesComplete: complete,
    battles: views,
    held: tallyLoot(held),
  };
}

export async function buildPlayerBattles(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
  userId: string;
  refresh?: boolean;
}): Promise<PlayerBattlesResponse> {
  const { db, userId, refresh = false } = options;
  const key = playerBattlesCacheKey(userId);

  if (!refresh) {
    const row = await getCachedRow<PlayerBattlesResponse>(db, key);
    const result = classifyCacheLookup(row, new Date());
    recordCacheLookup("player_battles", result);
    if (result === "hit" && row) return { ...row.payload, live: false };
  }

  const response = await buildLive(options);
  // An incomplete battle walk may hide the user's battles; do not pin that for a minute.
  if (response.battlesComplete) await setCached(db, key, response, PLAYER_BATTLES_TTL_SECONDS);
  return response;
}
