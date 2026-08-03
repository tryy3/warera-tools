import type { Db } from "./client";
import { muMemberStatSnapshots, muPolls, muStatSnapshots } from "./schema";

export type MuStatSnapshotRow = {
  muId: string;
  weeklyDamages: number | null;
  weeklyDamagesRank: number | null;
  weeklyDamagesTier: string | null;
  bounty: number | null;
  bountyRank: number | null;
  bountyTier: string | null;
  reputation: number | null;
  reputationRank: number | null;
  reputationTier: string | null;
  damages: number | null;
  damagesRank: number | null;
  damagesTier: string | null;
  terrain: number | null;
  terrainRank: number | null;
  terrainTier: string | null;
  wealth: number | null;
  wealthRank: number | null;
  wealthTier: string | null;
  levelingLevel: number | null;
  levelingMonthlyDamages: number | null;
  payload: Record<string, unknown> | null;
};

export type MuMemberStatSnapshotRow = {
  muId: string;
  userId: string;
  memberRowId: string | null;
  totalDamagesCount: number | null;
  monthlyDamagesCount: number | null;
  weeklyDamagesCount: number | null;
  totalHelpCount: number | null;
  monthlyHelpCount: number | null;
  weeklyHelpCount: number | null;
  payload: Record<string, unknown> | null;
};

export async function insertMuPoll(
  db: Db,
  values: {
    recordedAt: Date;
    status: string;
    error?: string | null;
    muCount: number;
    memberCount: number;
  },
): Promise<number> {
  const result = await db
    .insert(muPolls)
    .values({
      recordedAt: values.recordedAt,
      status: values.status,
      error: values.error ?? null,
      muCount: values.muCount,
      memberCount: values.memberCount,
    })
    .returning({ id: muPolls.id });
  const id = result[0]?.id;
  if (id == null) throw new Error("Failed to insert mu_polls row");
  return id;
}

export async function insertMuStatSnapshots(
  db: Db,
  pollId: number,
  rows: MuStatSnapshotRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(muStatSnapshots).values(
    rows.map((row) => ({
      pollId,
      muId: row.muId,
      weeklyDamages: row.weeklyDamages,
      weeklyDamagesRank: row.weeklyDamagesRank,
      weeklyDamagesTier: row.weeklyDamagesTier,
      bounty: row.bounty,
      bountyRank: row.bountyRank,
      bountyTier: row.bountyTier,
      reputation: row.reputation,
      reputationRank: row.reputationRank,
      reputationTier: row.reputationTier,
      damages: row.damages,
      damagesRank: row.damagesRank,
      damagesTier: row.damagesTier,
      terrain: row.terrain,
      terrainRank: row.terrainRank,
      terrainTier: row.terrainTier,
      wealth: row.wealth,
      wealthRank: row.wealthRank,
      wealthTier: row.wealthTier,
      levelingLevel: row.levelingLevel,
      levelingMonthlyDamages: row.levelingMonthlyDamages,
      payload: row.payload,
    })),
  );
}

export async function insertMuMemberStatSnapshots(
  db: Db,
  pollId: number,
  rows: MuMemberStatSnapshotRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(muMemberStatSnapshots).values(
    rows.map((row) => ({
      pollId,
      muId: row.muId,
      userId: row.userId,
      memberRowId: row.memberRowId,
      totalDamagesCount: row.totalDamagesCount,
      monthlyDamagesCount: row.monthlyDamagesCount,
      weeklyDamagesCount: row.weeklyDamagesCount,
      totalHelpCount: row.totalHelpCount,
      monthlyHelpCount: row.monthlyHelpCount,
      weeklyHelpCount: row.weeklyHelpCount,
      payload: row.payload,
    })),
  );
}
