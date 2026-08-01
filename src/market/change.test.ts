import { describe, expect, it } from "vite-plus/test";
import { calculatePriceChange } from "./change";

describe("calculatePriceChange", () => {
  it("returns absolute and percent", () => {
    expect(calculatePriceChange(1.1, 1.0)).toEqual({ absolute: 0.1, percent: 10 });
  });

  it("returns null when current, baseline, or baseline zero is unusable", () => {
    expect(calculatePriceChange(null, 1)).toBeNull();
    expect(calculatePriceChange(1, null)).toBeNull();
    expect(calculatePriceChange(1, 0)).toBeNull();
    expect(calculatePriceChange(Number.NaN, 1)).toBeNull();
  });
});
