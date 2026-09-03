import type { Db } from "./client";
import { battleLootSnapshots, battlePolls, battleScoreboardSnapshots } from "./schema";

export type BattlePollInsert = {
  recordedAt: Date;
  status: string;
  error?: string | null;
  activeBattlePages?: number | null;
  battleCount: number;
  lootSnapshotCount: number;
  finalizedCount: number;
};

export type BattleScoreboardSnapshotRow = {
  battleId: string;
  roundId: string | null;
  roundNumber: number | null;
  roundIsActive: boolean | null;
  attackerPoints: number | null;
  defenderPoints: number | null;
  attackerDamages: number | null;
  defenderDamages: number | null;
  attackerHitCount: number | null;
  defenderHitCount: number | null;
  ticksCount: number | null;
  nextTickAt: Date | null;
  roundStartedAtGame: Date | null;
  recordedAt: Date;
};

export type BattleLootSnapshotRow = {
  battleId: string;
  userId: string;
  muId: string;
  totalDmg: number | null;
  hits: number | null;
  totalMoneyFromBounty: number | null;
  totalMoneyFromContract: number | null;
  case1Count: number | null;
  case2Count: number | null;
  poolLoot: unknown[] | null;
  payload: Record<string, unknown> | null;
  recordedAt: Date;
};

export async function insertBattlePoll(db: Db, values: BattlePollInsert): Promise<number> {
  const result = await db
    .insert(battlePolls)
    .values({
      recordedAt: values.recordedAt,
      status: values.status,
      error: values.error ?? null,
      activeBattlePages: values.activeBattlePages ?? null,
      battleCount: values.battleCount,
      lootSnapshotCount: values.lootSnapshotCount,
      finalizedCount: values.finalizedCount,
    })
    .returning({ id: battlePolls.id });
  const id = result[0]?.id;
  if (id == null) throw new Error("Failed to insert battle_polls row");
  return id;
}

export async function insertBattleScoreboardSnapshots(
  db: Db,
  pollId: number,
  rows: BattleScoreboardSnapshotRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(battleScoreboardSnapshots).values(
    rows.map((row) => ({
      pollId,
      battleId: row.battleId,
      roundId: row.roundId,
      roundNumber: row.roundNumber,
      roundIsActive: row.roundIsActive,
      attackerPoints: row.attackerPoints,
      defenderPoints: row.defenderPoints,
      attackerDamages: row.attackerDamages,
      defenderDamages: row.defenderDamages,
      attackerHitCount: row.attackerHitCount,
      defenderHitCount: row.defenderHitCount,
      ticksCount: row.ticksCount,
      nextTickAt: row.nextTickAt,
      roundStartedAtGame: row.roundStartedAtGame,
      recordedAt: row.recordedAt,
    })),
  );
}

export async function insertBattleLootSnapshots(
  db: Db,
  pollId: number,
  rows: BattleLootSnapshotRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(battleLootSnapshots).values(
    rows.map((row) => ({
      pollId,
      battleId: row.battleId,
      userId: row.userId,
      muId: row.muId,
      totalDmg: row.totalDmg,
      hits: row.hits,
      totalMoneyFromBounty: row.totalMoneyFromBounty,
      totalMoneyFromContract: row.totalMoneyFromContract,
      case1Count: row.case1Count,
      case2Count: row.case2Count,
      poolLoot: row.poolLoot,
      payload: row.payload,
      recordedAt: row.recordedAt,
    })),
  );
}
