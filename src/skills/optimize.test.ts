import { describe, expect, it } from "vite-plus/test";
import { optimizeEcoSkills } from "./optimize";

const companies = [
  {
    id: "a",
    name: "a",
    aeLevel: 6,
    productionBonus: 0.5,
    profitPerPp: 0.1,
  },
];

describe("optimizeEcoSkills", () => {
  it("unspent never lowers levels", () => {
    const current = { energy: 3, entrepreneurship: 1, production: 2, companies: 0 };
    const r = optimizeEcoSkills({
      mode: "unspent",
      currentLevels: current,
      availableSkillPoints: 5,
      totalSkillPoints: 20,
      netWage: 0.12,
      companies,
    });
    for (const k of ["energy", "entrepreneurship", "production", "companies"] as const) {
      expect(r.levels[k]).toBeGreaterThanOrEqual(current[k]);
    }
  });

  it("full reset can zero non-starting eco and uses total SP budget", () => {
    const r = optimizeEcoSkills({
      mode: "full_eco_reset",
      currentLevels: { energy: 10, entrepreneurship: 10, production: 10, companies: 10 },
      availableSkillPoints: 0,
      totalSkillPoints: 15,
      netWage: 0.12,
      companies,
    });
    const spent =
      (r.levels.energy * (r.levels.energy + 1)) / 2 +
      (r.levels.entrepreneurship * (r.levels.entrepreneurship + 1)) / 2 +
      (r.levels.production * (r.levels.production + 1)) / 2 +
      (r.levels.companies * (r.levels.companies + 1)) / 2;
    expect(spent).toBeLessThanOrEqual(15);
    expect(r.totalGPerDay).toBeGreaterThan(0);
  });

  it("with 0 budget returns current income for unspent", () => {
    const current = { energy: 2, entrepreneurship: 1, production: 1, companies: 0 };
    const r = optimizeEcoSkills({
      mode: "unspent",
      currentLevels: current,
      availableSkillPoints: 0,
      totalSkillPoints: 10,
      netWage: 0.1,
      companies: [],
    });
    expect(r.levels).toEqual(current);
    expect(r.deltaGPerDay).toBeCloseTo(0);
  });
});
