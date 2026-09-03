import { isWareraGetRejectedError } from "./errors";
import type { WareraRequester } from "./prices";
import { unwrapTrpcData, wareraProcedurePath } from "./trpc";

export const SEED_MU_ID = "69e5dc36f7b095e977052f7b";

export type RankingStat = {
  value: number | null;
  rank: number | null;
  tier: string | null;
};

export type ParsedMuStats = {
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

export type ParsedMu = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  countryId: string | null;
  regionId: string | null;
  ownerUserId: string | null;
  mercenaryReputation: number | null;
  level: number | null;
  createdAtGame: Date | null;
  memberUserIds: string[];
  roles: Record<string, unknown> | null;
  activeUpgradeLevels: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  stats: ParsedMuStats;
};

export type ParsedMuMember = {
  memberRowId: string | null;
  muId: string;
  userId: string;
  totalDamagesCount: number | null;
  monthlyDamagesCount: number | null;
  weeklyDamagesCount: number | null;
  totalHelpCount: number | null;
  monthlyHelpCount: number | null;
  weeklyHelpCount: number | null;
  payload: Record<string, unknown> | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function pickFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pickInt(value: unknown): number | null {
  const n = pickFiniteNumber(value);
  return n == null ? null : Math.trunc(n);
}

function parseRanking(raw: unknown): RankingStat {
  const obj = asRecord(raw) ?? {};
  return {
    value: pickFiniteNumber(obj.value),
    rank: pickInt(obj.rank),
    tier: typeof obj.tier === "string" ? obj.tier : null,
  };
}

const KNOWN_MU_KEYS = new Set([
  "_id",
  "id",
  "name",
  "user",
  "region",
  "country",
  "avatarUrl",
  "mercenaryReputation",
  "members",
  "roles",
  "leveling",
  "activeUpgradeLevels",
  "rankings",
  "createdAt",
  "updatedAt",
  "__v",
]);

export function parseMuById(raw: unknown): ParsedMu {
  const obj = asRecord(raw) ?? {};
  const id = pickString(obj, ["_id", "id", "muId"]);
  if (!id) throw new Error("mu.getById missing id");

  const membersRaw = obj.members;
  const memberUserIds = Array.isArray(membersRaw)
    ? membersRaw.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];

  const rankings = asRecord(obj.rankings) ?? {};
  const weekly = parseRanking(rankings.muWeeklyDamages);
  const bounty = parseRanking(rankings.muBounty);
  const reputation = parseRanking(rankings.muReputation);
  const damages = parseRanking(rankings.muDamages);
  const terrain = parseRanking(rankings.muTerrain);
  const wealth = parseRanking(rankings.muWealth);
  const leveling = asRecord(obj.leveling) ?? {};

  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!KNOWN_MU_KEYS.has(k)) payload[k] = v;
  }

  const createdAt = pickString(obj, ["createdAt"]);
  return {
    id,
    name: pickString(obj, ["name"]),
    avatarUrl: pickString(obj, ["avatarUrl"]),
    countryId: pickString(obj, ["country", "countryId"]),
    regionId: pickString(obj, ["region", "regionId"]),
    ownerUserId: pickString(obj, ["user", "ownerUserId"]),
    mercenaryReputation: pickFiniteNumber(obj.mercenaryReputation),
    level: pickInt(leveling.level),
    createdAtGame: createdAt ? new Date(createdAt) : null,
    memberUserIds,
    roles: asRecord(obj.roles),
    activeUpgradeLevels: asRecord(obj.activeUpgradeLevels),
    payload: Object.keys(payload).length > 0 ? payload : null,
    stats: {
      weeklyDamages: weekly.value,
      weeklyDamagesRank: weekly.rank,
      weeklyDamagesTier: weekly.tier,
      bounty: bounty.value,
      bountyRank: bounty.rank,
      bountyTier: bounty.tier,
      reputation: reputation.value,
      reputationRank: reputation.rank,
      reputationTier: reputation.tier,
      damages: damages.value,
      damagesRank: damages.rank,
      damagesTier: damages.tier,
      terrain: terrain.value,
      terrainRank: terrain.rank,
      terrainTier: terrain.tier,
      wealth: wealth.value,
      wealthRank: wealth.rank,
      wealthTier: wealth.tier,
      levelingLevel: pickInt(leveling.level),
      levelingMonthlyDamages: pickFiniteNumber(leveling.monthlyDamages),
    },
  };
}

const KNOWN_MEMBER_KEYS = new Set([
  "_id",
  "id",
  "mu",
  "user",
  "totalDamagesCount",
  "monthlyDamagesCount",
  "weeklyDamagesCount",
  "totalHelpCount",
  "monthlyHelpCount",
  "weeklyHelpCount",
  "createdAt",
  "updatedAt",
  "__v",
]);

export function parseMuMembers(raw: unknown): ParsedMuMember[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: ParsedMuMember[] = [];
  for (const item of list) {
    const obj = asRecord(item);
    if (!obj) continue;
    const muId = pickString(obj, ["mu", "muId"]);
    const userId = pickString(obj, ["user", "userId"]);
    if (!muId || !userId) continue;
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!KNOWN_MEMBER_KEYS.has(k)) payload[k] = v;
    }
    out.push({
      memberRowId: pickString(obj, ["_id", "id"]),
      muId,
      userId,
      totalDamagesCount: pickInt(obj.totalDamagesCount),
      monthlyDamagesCount: pickInt(obj.monthlyDamagesCount),
      weeklyDamagesCount: pickInt(obj.weeklyDamagesCount),
      totalHelpCount: pickInt(obj.totalHelpCount),
      monthlyHelpCount: pickInt(obj.monthlyHelpCount),
      weeklyHelpCount: pickInt(obj.weeklyHelpCount),
      payload: Object.keys(payload).length > 0 ? payload : null,
    });
  }
  return out;
}

export async function fetchMuById(warera: WareraRequester, muId: string): Promise<ParsedMu> {
  const json = await warera.request<unknown>(wareraProcedurePath("mu.getById", { muId }));
  return parseMuById(unwrapTrpcData(json));
}

const MU_MEMBER_BY_MU_INIT = {
  authStyle: "api-key" as const,
};

/**
 * Live api2 procedure; not on official OpenAPI (same class as
 * company.getRecommendedRegionIdsByItemCode). Requires X-API-Key; prefer GET,
 * fall back to POST when GET is rejected.
 */
export async function fetchMuMembersByMu(
  warera: WareraRequester,
  muId: string,
): Promise<ParsedMuMember[]> {
  try {
    const json = await warera.request<unknown>(wareraProcedurePath("muMember.getByMu", { muId }), {
      ...MU_MEMBER_BY_MU_INIT,
      method: "GET",
    });
    return parseMuMembers(unwrapTrpcData(json));
  } catch (err) {
    if (!isWareraGetRejectedError(err)) throw err;
    const json = await warera.request<unknown>("muMember.getByMu", {
      method: "POST",
      json: { muId },
      ...MU_MEMBER_BY_MU_INIT,
    });
    return parseMuMembers(unwrapTrpcData(json));
  }
}

export function deriveMemberRole(
  userId: string,
  ownerUserId: string | null,
  roles: Record<string, unknown> | null,
): string {
  if (ownerUserId && userId === ownerUserId) return "owner";
  const managers = Array.isArray(roles?.managers) ? roles.managers : [];
  const commanders = Array.isArray(roles?.commanders) ? roles.commanders : [];
  if (managers.includes(userId)) return "manager";
  if (commanders.includes(userId)) return "commander";
  return "member";
}
