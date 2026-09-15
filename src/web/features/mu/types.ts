import type { MemberHistoryMetric, MuHistoryMetric } from "../../../mu/metrics";
import type { MuHistoryRange } from "../../../mu/ranges";
import type { FightPlayerInput } from "../../../fight-damage/types";

export type MuSearchHit = { muId: string; name: string };

export type EconomyMuSearchResponse = { mus: MuSearchHit[] };

export type MuMemberLatest = Partial<Record<MemberHistoryMetric, number | null>>;

export type MuDetailMember = {
  userId: string;
  role: string | null;
  username: string | null;
  latest: MuMemberLatest | null;
};

export type MuDetailMu = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  countryId: string | null;
  regionId: string | null;
  level: number | null;
  mercenaryReputation: number | null;
  fetchedAt: string | null;
};

export type MuLatestStats = Partial<Record<MuHistoryMetric, number | null>> & {
  weeklyDamagesRank?: number | null;
  weeklyDamagesTier?: string | null;
  bountyRank?: number | null;
  bountyTier?: string | null;
  reputationRank?: number | null;
  reputationTier?: string | null;
  damagesRank?: number | null;
  damagesTier?: string | null;
  terrainRank?: number | null;
  terrainTier?: string | null;
  wealthRank?: number | null;
  wealthTier?: string | null;
};

export type MuDetailResponse = {
  mu: MuDetailMu;
  members: MuDetailMember[];
  latestMuStats: MuLatestStats | null;
  meta: {
    watched: boolean;
    historyAvailable: boolean;
    liveFilled: boolean;
  };
};

export type MuHistoryPoint = { recordedAt: string; value: number | null };

export type MuHistoryResponse = {
  range: MuHistoryRange;
  scope: "mu";
  metric: MuHistoryMetric;
  points: MuHistoryPoint[];
};

export type MuMemberHistorySeries = {
  userId: string;
  label: string;
  points: MuHistoryPoint[];
};

export type MuMemberHistoryResponse = {
  range: MuHistoryRange;
  scope: "members";
  metric: MemberHistoryMetric;
  series: MuMemberHistorySeries[];
};

export type MuFightDeskMember = {
  userId: string;
  username: string | null;
  level: number | null;
  role: string | null;
  incomplete: boolean;
  fight: FightPlayerInput | null;
  display: {
    avatarUrl: string | null;
    militaryRankBonus: number | null;
    ammoLabel: string | null;
    pillLabel: string | null;
    pillEndsAt: string | null;
    skillLevels: Record<string, number>;
    lastSkillsResetAt: string | null;
  };
};

export type MuFightDeskResponse = {
  mu: { id: string; name: string | null };
  asOf: string | null;
  members: MuFightDeskMember[];
  meta: {
    watched: boolean;
    liveFilled: boolean;
  };
};
