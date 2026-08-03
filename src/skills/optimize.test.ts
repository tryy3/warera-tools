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

  it("does not spend SP when every candidate has ΔG ≤ 0", () => {
    const current = { energy: 1, entrepreneurship: 1, production: 1, companies: 0 };
    const r = optimizeEcoSkills({
      mode: "unspent",
      currentLevels: current,
      availableSkillPoints: 10,
      totalSkillPoints: 20,
      netWage: 0,
      companies: [],
    });
    expect(r.levels).toEqual(current);
    expect(r.deltaGPerDay).toBeCloseTo(0);
  });

  it("full reset prefers companies on equal score when under-slotted", () => {
    // AE daily each = 10 * 24 * 0.1 = 24; energy L0→L1 also yields ΔG=24 at netWage=1.
    // Without the tie-break, energy (first in ECO_SKILL_IDS) would win.
    const threeSlots = [
      { id: "a", name: "a", aeLevel: 10, productionBonus: 0, profitPerPp: 0.1 },
      { id: "b", name: "b", aeLevel: 10, productionBonus: 0, profitPerPp: 0.1 },
      { id: "c", name: "c", aeLevel: 10, productionBonus: 0, profitPerPp: 0.1 },
    ];
    const r = optimizeEcoSkills({
      mode: "full_eco_reset",
      currentLevels: { energy: 5, entrepreneurship: 5, production: 5, companies: 5 },
      availableSkillPoints: 0,
      totalSkillPoints: 1,
      netWage: 1,
      companies: threeSlots,
    });
    expect(r.levels.companies).toBe(1);
    expect(r.levels.energy).toBe(0);
  });

  it("never raises any eco skill above MAX_ECO_SKILL_LEVEL", () => {
    const r = optimizeEcoSkills({
      mode: "full_eco_reset",
      currentLevels: { energy: 0, entrepreneurship: 0, production: 0, companies: 0 },
      availableSkillPoints: 0,
      totalSkillPoints: 10_000,
      netWage: 1,
      companies: [
        { id: "a", name: "a", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
        { id: "b", name: "b", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
        { id: "c", name: "c", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
        { id: "d", name: "d", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
        { id: "e", name: "e", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
        { id: "f", name: "f", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
        { id: "g", name: "g", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
        { id: "h", name: "h", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
        { id: "i", name: "i", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
        { id: "j", name: "j", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
        { id: "k", name: "k", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
        { id: "l", name: "l", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
      ],
    });
    for (const k of ["energy", "entrepreneurship", "production", "companies"] as const) {
      expect(r.levels[k]).toBeLessThanOrEqual(10);
    }
  });
});
