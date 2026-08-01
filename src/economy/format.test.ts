import { describe, expect, it } from "vite-plus/test";
import { formatDisplayNumber } from "./format";

describe("formatDisplayNumber", () => {
  it("rounds to at most 4 fraction digits", () => {
    expect(formatDisplayNumber(0.08560533885010638)).toBe("0.0856");
    expect(formatDisplayNumber(18.5524)).toBe("18.5524");
    expect(formatDisplayNumber(50.5, 1)).toBe("50.5");
  });

  it("uses fixed locale-independent decimal for formula strings", () => {
    // Implementation must not depend on process locale for formula embedding.
    expect(formatDisplayNumber(1234.5)).toMatch(/^1234\.5/);
  });
});
