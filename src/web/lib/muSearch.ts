import {
  DEFAULT_MEMBER_METRIC,
  DEFAULT_MU_METRIC,
  isMemberHistoryMetric,
  isMuHistoryMetric,
  type MemberHistoryMetric,
  type MuHistoryMetric,
} from "../../mu/metrics";
import { parseMuHistoryRange, type MuHistoryRange } from "../../mu/ranges";

export type MuDetailSearch = {
  range: MuHistoryRange;
  memberRange: MuHistoryRange;
  muMetric: MuHistoryMetric;
  memberMetric: MemberHistoryMetric;
};

export function parseMuDetailSearch(search: Record<string, unknown>): MuDetailSearch {
  return {
    range: parseMuHistoryRange(search.range),
    memberRange: parseMuHistoryRange(search.memberRange ?? search.range),
    muMetric: isMuHistoryMetric(search.muMetric) ? search.muMetric : DEFAULT_MU_METRIC,
    memberMetric: isMemberHistoryMetric(search.memberMetric)
      ? search.memberMetric
      : DEFAULT_MEMBER_METRIC,
  };
}
