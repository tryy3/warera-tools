import { describe, expect, it } from "vite-plus/test";
import { formatGold, formatPlanDuration, formatPlanStatus } from "./format";

describe("formatPlanDuration", () => {
  it("prefers days with one decimal for multi-day waits", () => {
    expect(formatPlanDuration(48)).toBe("2d");
    expect(formatPlanDuration(36)).toBe("1.5d");
    expect(formatPlanDuration(24 * 12.4)).toBe("12.4d");
  });

  it("uses hours or minutes under a day", () => {
    expect(formatPlanDuration(5)).toBe("5h");
    expect(formatPlanDuration(0.5)).toBe("30m");
    expect(formatPlanDuration(0)).toBe("now");
  });
});

describe("formatPlanStatus", () => {
  it("does not label iter limit as stuck", () => {
    const status = formatPlanStatus({
      complete: false,
      stuck: false,
      hitIterLimit: true,
      timeToGoalHours: null,
      steps: [],
      series: [],
      finalFactories: [],
    });
    expect(status.label).toBe("incomplete");
    expect(status.tone).toBe("warn");
  });
});

describe("formatGold", () => {
  it("rounds long floats", () => {
    expect(formatGold(1.6204659265808647, 2)).toBe("1.62");
  });
});
