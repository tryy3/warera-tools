import { describe, expect, it } from "vite-plus/test";
import { ATTRACTIVE_MARGIN, recommendListing } from "./recommend";

describe("recommendListing", () => {
  it("computes scrap floor and break-even incl", () => {
    // purple = 162 scraps; 162 * 0.215 = 34.83; break-even incl = 34.83 * 1.01
    const r = recommendListing({ tier: "purple", scrapPrice: 0.215, taxRate: 0.01 });
    expect(r.scrapFloor.toNumber()).toBeCloseTo(34.83, 5);
    expect(r.breakEvenIncl.toNumber()).toBeCloseTo(34.83 * 1.01, 5);
    expect(r.attractiveIncl.toNumber()).toBeCloseTo(
      r.breakEvenIncl.toNumber() * (1 + ATTRACTIVE_MARGIN),
      5,
    );
  });
});
