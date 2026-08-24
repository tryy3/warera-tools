import type { MemberHistoryMetric, MuHistoryMetric } from "../../../mu/metrics";
import type { MuHistoryRange } from "../../../mu/ranges";

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
