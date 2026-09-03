export const MU_HISTORY_METRICS = [
  "weeklyDamages",
  "bounty",
  "reputation",
  "damages",
  "terrain",
  "wealth",
  "levelingLevel",
  "levelingMonthlyDamages",
] as const;
export type MuHistoryMetric = (typeof MU_HISTORY_METRICS)[number];

export const MEMBER_HISTORY_METRICS = [
  "totalDamagesCount",
  "monthlyDamagesCount",
  "weeklyDamagesCount",
  "totalHelpCount",
  "monthlyHelpCount",
  "weeklyHelpCount",
] as const;
export type MemberHistoryMetric = (typeof MEMBER_HISTORY_METRICS)[number];

export const DEFAULT_MU_METRIC: MuHistoryMetric = "weeklyDamages";
export const DEFAULT_MEMBER_METRIC: MemberHistoryMetric = "weeklyDamagesCount";

export function isMuHistoryMetric(v: unknown): v is MuHistoryMetric {
  return typeof v === "string" && (MU_HISTORY_METRICS as readonly string[]).includes(v);
}
export function isMemberHistoryMetric(v: unknown): v is MemberHistoryMetric {
  return typeof v === "string" && (MEMBER_HISTORY_METRICS as readonly string[]).includes(v);
}
