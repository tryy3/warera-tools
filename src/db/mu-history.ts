import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { MemberHistoryMetric, MuHistoryMetric } from "../mu/metrics";
import { resolveMuHistoryWindow, type MuHistoryRange } from "../mu/ranges";
import type { Db } from "./client";
import { muMemberStatSnapshots, muPolls, muStatSnapshots } from "./schema";

const OK_STATUSES = ["success", "partial"] as const;

export type MuStatHistoryPoint = {
  recordedAt: Date;
  value: number | null;
};

export type MuMemberStatHistoryPoint = {
  recordedAt: Date;
  userId: string;
  value: number | null;
};

export type LatestMuStatSnapshot = {
  recordedAt: Date;
  pollId: number;
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
};

export type LatestMemberStatSnapshot = {
  recordedAt: Date;
  pollId: number;
  muId: string;
  userId: string;
  memberRowId: string | null;
  totalDamagesCount: number | null;
  monthlyDamagesCount: number | null;
  weeklyDamagesCount: number | null;
  totalHelpCount: number | null;
  monthlyHelpCount: number | null;
  weeklyHelpCount: number | null;
};

function mapMuSnapshotRow(row: {
  recordedAt: Date;
  pollId: number;
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
}): LatestMuStatSnapshot {
  return {
    recordedAt: row.recordedAt,
    pollId: row.pollId,
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
  };
}

function mapMemberSnapshotRow(row: {
  recordedAt: Date;
  pollId: number;
  muId: string;
  userId: string;
  memberRowId: string | null;
  totalDamagesCount: number | null;
  monthlyDamagesCount: number | null;
  weeklyDamagesCount: number | null;
  totalHelpCount: number | null;
  monthlyHelpCount: number | null;
  weeklyHelpCount: number | null;
}): LatestMemberStatSnapshot {
  return {
    recordedAt: row.recordedAt,
    pollId: row.pollId,
    muId: row.muId,
    userId: row.userId,
    memberRowId: row.memberRowId,
    totalDamagesCount: row.totalDamagesCount,
    monthlyDamagesCount: row.monthlyDamagesCount,
    weeklyDamagesCount: row.weeklyDamagesCount,
    totalHelpCount: row.totalHelpCount,
    monthlyHelpCount: row.monthlyHelpCount,
    weeklyHelpCount: row.weeklyHelpCount,
  };
}

export async function getMuStatHistory(
  db: Db,
  muId: string,
  metric: MuHistoryMetric,
  range: MuHistoryRange,
  now: Date = new Date(),
): Promise<MuStatHistoryPoint[]> {
  const { from, to } = resolveMuHistoryWindow(range, now);
  const conds = [
    eq(muStatSnapshots.muId, muId),
    inArray(muPolls.status, [...OK_STATUSES]),
    lte(muPolls.recordedAt, to),
  ];
  if (from) conds.push(gte(muPolls.recordedAt, from));

  const rows = await db
    .select({
      recordedAt: muPolls.recordedAt,
      value: muStatSnapshots[metric],
    })
    .from(muStatSnapshots)
    .innerJoin(muPolls, eq(muStatSnapshots.pollId, muPolls.id))
    .where(and(...conds))
    .orderBy(asc(muPolls.recordedAt), asc(muPolls.id));

  return rows.map((r) => ({ recordedAt: r.recordedAt, value: r.value ?? null }));
}

export async function getMuMemberStatHistory(
  db: Db,
  muId: string,
  metric: MemberHistoryMetric,
  range: MuHistoryRange,
  now: Date = new Date(),
): Promise<MuMemberStatHistoryPoint[]> {
  const { from, to } = resolveMuHistoryWindow(range, now);
  const conds = [
    eq(muMemberStatSnapshots.muId, muId),
    inArray(muPolls.status, [...OK_STATUSES]),
    lte(muPolls.recordedAt, to),
  ];
  if (from) conds.push(gte(muPolls.recordedAt, from));

  const rows = await db
    .select({
      recordedAt: muPolls.recordedAt,
      userId: muMemberStatSnapshots.userId,
      value: muMemberStatSnapshots[metric],
    })
    .from(muMemberStatSnapshots)
    .innerJoin(muPolls, eq(muMemberStatSnapshots.pollId, muPolls.id))
    .where(and(...conds))
    .orderBy(asc(muPolls.recordedAt), asc(muPolls.id), asc(muMemberStatSnapshots.userId));

  return rows.map((r) => ({
    recordedAt: r.recordedAt,
    userId: r.userId,
    value: r.value ?? null,
  }));
}

export async function getLatestMuStatSnapshot(
  db: Db,
  muId: string,
): Promise<LatestMuStatSnapshot | null> {
  const rows = await db
    .select({
      recordedAt: muPolls.recordedAt,
      pollId: muStatSnapshots.pollId,
      muId: muStatSnapshots.muId,
      weeklyDamages: muStatSnapshots.weeklyDamages,
      weeklyDamagesRank: muStatSnapshots.weeklyDamagesRank,
      weeklyDamagesTier: muStatSnapshots.weeklyDamagesTier,
      bounty: muStatSnapshots.bounty,
      bountyRank: muStatSnapshots.bountyRank,
      bountyTier: muStatSnapshots.bountyTier,
      reputation: muStatSnapshots.reputation,
      reputationRank: muStatSnapshots.reputationRank,
      reputationTier: muStatSnapshots.reputationTier,
      damages: muStatSnapshots.damages,
      damagesRank: muStatSnapshots.damagesRank,
      damagesTier: muStatSnapshots.damagesTier,
      terrain: muStatSnapshots.terrain,
      terrainRank: muStatSnapshots.terrainRank,
      terrainTier: muStatSnapshots.terrainTier,
      wealth: muStatSnapshots.wealth,
      wealthRank: muStatSnapshots.wealthRank,
      wealthTier: muStatSnapshots.wealthTier,
      levelingLevel: muStatSnapshots.levelingLevel,
      levelingMonthlyDamages: muStatSnapshots.levelingMonthlyDamages,
    })
    .from(muStatSnapshots)
    .innerJoin(muPolls, eq(muStatSnapshots.pollId, muPolls.id))
    .where(and(eq(muStatSnapshots.muId, muId), inArray(muPolls.status, [...OK_STATUSES])))
    .orderBy(desc(muPolls.recordedAt), desc(muPolls.id))
    .limit(1);

  const row = rows[0];
  return row ? mapMuSnapshotRow(row) : null;
}

export async function getLatestMemberStatSnapshots(
  db: Db,
  muId: string,
): Promise<LatestMemberStatSnapshot[]> {
  const latestPoll = await db
    .select({ pollId: muMemberStatSnapshots.pollId, recordedAt: muPolls.recordedAt })
    .from(muMemberStatSnapshots)
    .innerJoin(muPolls, eq(muMemberStatSnapshots.pollId, muPolls.id))
    .where(and(eq(muMemberStatSnapshots.muId, muId), inArray(muPolls.status, [...OK_STATUSES])))
    .orderBy(desc(muPolls.recordedAt), desc(muPolls.id))
    .limit(1);

  const pollId = latestPoll[0]?.pollId;
  if (pollId == null) return [];

  const rows = await db
    .select({
      recordedAt: muPolls.recordedAt,
      pollId: muMemberStatSnapshots.pollId,
      muId: muMemberStatSnapshots.muId,
      userId: muMemberStatSnapshots.userId,
      memberRowId: muMemberStatSnapshots.memberRowId,
      totalDamagesCount: muMemberStatSnapshots.totalDamagesCount,
      monthlyDamagesCount: muMemberStatSnapshots.monthlyDamagesCount,
      weeklyDamagesCount: muMemberStatSnapshots.weeklyDamagesCount,
      totalHelpCount: muMemberStatSnapshots.totalHelpCount,
      monthlyHelpCount: muMemberStatSnapshots.monthlyHelpCount,
      weeklyHelpCount: muMemberStatSnapshots.weeklyHelpCount,
    })
    .from(muMemberStatSnapshots)
    .innerJoin(muPolls, eq(muMemberStatSnapshots.pollId, muPolls.id))
    .where(
      and(
        eq(muMemberStatSnapshots.muId, muId),
        eq(muMemberStatSnapshots.pollId, pollId),
        inArray(muPolls.status, [...OK_STATUSES]),
      ),
    )
    .orderBy(asc(muMemberStatSnapshots.userId));

  return rows.map((row) => mapMemberSnapshotRow(row));
}
