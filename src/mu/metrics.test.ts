import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_MEMBER_METRIC,
  DEFAULT_MU_METRIC,
  isMemberHistoryMetric,
  isMuHistoryMetric,
  MEMBER_HISTORY_METRICS,
  MU_HISTORY_METRICS,
} from "./metrics";

describe("MU_HISTORY_METRICS", () => {
  it("includes expected MU metrics", () => {
    expect(MU_HISTORY_METRICS).toContain("weeklyDamages");
    expect(MU_HISTORY_METRICS).toContain("bounty");
    expect(MU_HISTORY_METRICS).toContain("reputation");
  });
});

describe("MEMBER_HISTORY_METRICS", () => {
  it("includes expected member metrics", () => {
    expect(MEMBER_HISTORY_METRICS).toContain("weeklyDamagesCount");
    expect(MEMBER_HISTORY_METRICS).toContain("totalHelpCount");
  });
});

describe("isMuHistoryMetric", () => {
  it("returns true for valid keys", () => {
    expect(isMuHistoryMetric("weeklyDamages")).toBe(true);
    expect(isMuHistoryMetric("bounty")).toBe(true);
  });

  it("returns false for unknown values", () => {
    expect(isMuHistoryMetric("nope")).toBe(false);
    expect(isMuHistoryMetric(undefined)).toBe(false);
    expect(isMuHistoryMetric(42)).toBe(false);
  });
});

describe("isMemberHistoryMetric", () => {
  it("returns true for valid keys", () => {
    expect(isMemberHistoryMetric("weeklyDamagesCount")).toBe(true);
    expect(isMemberHistoryMetric("totalHelpCount")).toBe(true);
  });

  it("returns false for unknown values", () => {
    expect(isMemberHistoryMetric("nope")).toBe(false);
    expect(isMemberHistoryMetric(undefined)).toBe(false);
    expect(isMemberHistoryMetric(42)).toBe(false);
  });
});

describe("defaults", () => {
  it("exports default MU and member metrics", () => {
    expect(DEFAULT_MU_METRIC).toBe("weeklyDamages");
    expect(DEFAULT_MEMBER_METRIC).toBe("weeklyDamagesCount");
  });
});
