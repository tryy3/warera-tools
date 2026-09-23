import {
  DEFAULT_MEMBER_METRIC,
  DEFAULT_MU_METRIC,
  isMemberHistoryMetric,
  isMuHistoryMetric,
  type MemberHistoryMetric,
  type MuHistoryMetric,
} from "../../mu/metrics";
import { parseMuHistoryRange, type MuHistoryRange } from "../../mu/ranges";

export type MuDetailTab = "overview" | "members" | "fight";

export type MuDetailSearch = {
  tab: MuDetailTab;
  range: MuHistoryRange;
  memberRange: MuHistoryRange;
  muMetric: MuHistoryMetric;
  memberMetric: MemberHistoryMetric;
};

export function parseMuDetailSearch(search: Record<string, unknown>): MuDetailSearch {
  return {
    tab:
      search.tab === "members" || search.tab === "fight" || search.tab === "overview"
        ? search.tab
        : "overview",
    range: parseMuHistoryRange(search.range),
    memberRange: parseMuHistoryRange(search.memberRange ?? search.range),
    muMetric: isMuHistoryMetric(search.muMetric) ? search.muMetric : DEFAULT_MU_METRIC,
    memberMetric: isMemberHistoryMetric(search.memberMetric)
      ? search.memberMetric
      : DEFAULT_MEMBER_METRIC,
  };
}
