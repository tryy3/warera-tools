import { and, asc, eq, isNull } from "drizzle-orm";
import type { ParsedBattle } from "../warera/battles";
import type { Db } from "./client";
import { battles } from "./schema";

export type BattleRow = typeof battles.$inferSelect;

export type UpsertBattleFromParsedOpts = {
  stickyMuIds: string[];
  fetchedAt: Date;
  endedAt?: Date | null;
  finalizedAt?: Date | null;
  isActive?: boolean;
};

export function mergeStickyMuIds(existing: string[] | null, add: string[]): string[] {
  return [...new Set([...(existing ?? []), ...add])].toSorted();
}

export async function listActiveTrackedBattles(db: Db): Promise<BattleRow[]> {
  return db.select().from(battles).where(eq(battles.isActive, true)).orderBy(asc(battles.id));
}

export async function upsertBattleFromParsed(
  db: Db,
  parsed: ParsedBattle,
  opts: UpsertBattleFromParsedOpts,
): Promise<void> {
  const [existing] = await db.select().from(battles).where(eq(battles.id, parsed.id));
  const stickyMuIds = mergeStickyMuIds(existing?.stickyMuIds ?? null, opts.stickyMuIds);
  const isActive = opts.isActive ?? existing?.isActive ?? parsed.isActive;

  const identity = {
    warId: parsed.warId,
    type: parsed.type,
    attackerCountryId: parsed.attacker.countryId,
    defenderCountryId: parsed.defender.countryId,
    attackerRegionId: parsed.attacker.regionId,
    defenderRegionId: parsed.defender.regionId,
    roundsToWin: parsed.roundsToWin,
    currentRoundId: parsed.currentRound?.id ?? null,
    currentRoundNumber: parsed.currentRound?.number ?? null,
    attackerWonRounds: parsed.attacker.wonRoundsCount,
    defenderWonRounds: parsed.defender.wonRoundsCount,
    attackerMuOrders: parsed.attacker.muOrders,
    defenderMuOrders: parsed.defender.muOrders,
    stickyMuIds,
    roundsHistory: parsed.roundsHistory,
    startedAtGame: parsed.startedAtGame,
    fetchedAt: opts.fetchedAt,
    payload: parsed.payload,
  };

  const insertEndedAt = "endedAt" in opts ? (opts.endedAt ?? null) : (existing?.endedAt ?? null);
  const insertFinalizedAt =
    "finalizedAt" in opts ? (opts.finalizedAt ?? null) : (existing?.finalizedAt ?? null);

  await db
    .insert(battles)
    .values({
      id: parsed.id,
      isActive,
      endedAt: insertEndedAt,
      finalizedAt: insertFinalizedAt,
      ...identity,
    })
    .onConflictDoUpdate({
      target: battles.id,
      set: {
        ...identity,
        ...(opts.isActive !== undefined ? { isActive: opts.isActive } : {}),
        ...("endedAt" in opts ? { endedAt: opts.endedAt ?? null } : {}),
        ...("finalizedAt" in opts ? { finalizedAt: opts.finalizedAt ?? null } : {}),
      },
    });
}

export async function markBattleEnded(db: Db, battleId: string, endedAt: Date): Promise<void> {
  await db
    .update(battles)
    .set({ endedAt })
    .where(and(eq(battles.id, battleId), isNull(battles.endedAt)));
}

export async function markBattleFinalized(
  db: Db,
  battleId: string,
  finalizedAt: Date,
): Promise<void> {
  await db.update(battles).set({ isActive: false, finalizedAt }).where(eq(battles.id, battleId));
}
