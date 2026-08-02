import { describe, expect, it } from "vite-plus/test";
import { calculateDailyIncome, dailyActionsFromBar } from "./income";

const cos = (id: string, ae: number, bonus: number, ppp: number) => ({
  id,
  name: id,
  aeLevel: ae,
  productionBonus: bonus,
  profitPerPp: ppp,
});

describe("dailyActionsFromBar", () => {
  it("uses 10% hourly regen over 24h", () => {
    expect(dailyActionsFromBar(40)).toBeCloseTo(9.6);
  });
});

describe("calculateDailyIncome", () => {
  it("matches work + self-work + capped AE", () => {
    const companies = [cos("a", 6, 0.5, 0.1), cos("b", 6, 0.5, 0.1), cos("c", 5, 0.5, 0.1)];
    // companies value at level 0 = 2 → only top 2 AE companies
    const r = calculateDailyIncome({
      levels: { energy: 1, entrepreneurship: 1, production: 1, companies: 0 },
      netWage: 0.1,
      companies,
    });
    // energy L1 value 40 → actions 9.6; prod value 13; work = 9.6*13*0.1
    expect(r.ppPerAction).toBe(13);
    expect(r.workGPerDay).toBeCloseTo(9.6 * 13 * 0.1);
    expect(r.activeSlots).toBe(2);
    expect(r.aeCompanyIds).toHaveLength(2);
    expect(r.totalGPerDay).toBeCloseTo(r.workGPerDay + r.selfWorkGPerDay + r.aeGPerDay);
  });

  it("zeros work when netWage is 0", () => {
    const r = calculateDailyIncome({
      levels: { energy: 5, entrepreneurship: 0, production: 3, companies: 0 },
      netWage: 0,
      companies: [],
    });
    expect(r.workGPerDay).toBe(0);
  });
});
