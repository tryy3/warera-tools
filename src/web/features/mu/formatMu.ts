import type { MemberHistoryMetric, MuHistoryMetric } from "../../../mu/metrics";
import type { MuHistoryRange } from "../../../mu/ranges";

const RANGE_LABELS: Record<MuHistoryRange, string> = {
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
  all: "all",
  this_week: "This week",
  last_week: "Last week",
};

export function muRangeLabel(range: MuHistoryRange): string {
  return RANGE_LABELS[range];
}

export function formatMuMetricLabel(metric: MuHistoryMetric | MemberHistoryMetric): string {
  return metric.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

/** Stable HSL stroke color from a user id. */
export function colorForUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}
