import type { BattleSideId } from "../warera/battle-ranking";
import { buildLootLadder, type LootLadder, type RankedLootRow } from "./ladder";

export type LootScope = "round" | "battle";

export type SideRanking = { rows: RankedLootRow[]; complete: boolean };
export type ScopeRankings = Record<BattleSideId, SideRanking>;

export type BattleRankings = {
  /** Null when the battle has no current round. */
  round: ScopeRankings | null;
  battle: ScopeRankings;
};

export type ScopedLadder = LootLadder & {
  scope: LootScope;
  side: BattleSideId;
  myDamage: number;
  rankingComplete: boolean;
};

const SIDES: readonly BattleSideId[] = ["attacker", "defender"];

function findSide(rankings: ScopeRankings | null, userId: string): BattleSideId | null {
  if (!rankings) return null;
  return SIDES.find((side) => rankings[side].rows.some((r) => r.userId === userId)) ?? null;
}

/**
 * The loot summary carries no side, so the side comes from where the user appears in a ranking.
 * With no hit in either ranking the side stays unknown and both sides get a ladder.
 */
export function resolveBattleLadders(
  rankings: BattleRankings,
  userId: string,
  battleDamage: number | null,
): { mySide: BattleSideId | null; ladders: ScopedLadder[] } {
  const mySide = findSide(rankings.round, userId) ?? findSide(rankings.battle, userId);
  const sides = mySide ? [mySide] : SIDES;
  const ladders: ScopedLadder[] = [];

  for (const scope of ["round", "battle"] as const) {
    const scoped = rankings[scope];
    if (!scoped) continue;
    for (const side of sides) {
      const { rows, complete } = scoped[side];
      const ownValue = rows.find((r) => r.userId === userId)?.value ?? null;
      const myDamage = scope === "battle" ? (battleDamage ?? ownValue ?? 0) : (ownValue ?? 0);
      ladders.push({
        ...buildLootLadder(rows, userId, myDamage),
        scope,
        side,
        myDamage,
        rankingComplete: complete,
      });
    }
  }
  return { mySide, ladders };
}
