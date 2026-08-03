import { describe, expect, it } from "vite-plus/test";
import { mapUser } from "./map";
import type { MapUserInput } from "./map";

function baseInput(over: Partial<MapUserInput> = {}): MapUserInput {
  return {
    userId: "u1",
    recordedAt: "2026-08-03T00:00:00.000Z",
    companiesFetchedAt: 1,
    companiesRefreshed: false,
    lite: {
      userId: "u1",
      username: "Ada",
      leveling: {
        level: 10,
        availableSkillPoints: 5,
        spentSkillPoints: 15,
        totalSkillPoints: 20,
      },
      skillLevels: { energy: 1, entrepreneurship: 1, production: 1, companies: 0 },
      skillValues: { energy: 40, entrepreneurship: 35, production: 13, companies: 2 },
    },
    job: {
      status: "resolved",
      companyId: "job1",
      grossWage: 0.12,
      incomeTaxRate: 0.1,
      netWage: 0.1,
    },
    packEntries: [],
    prices: {},
    ...over,
  };
}

describe("mapUser", () => {
  it("maps identity/skills/job and computes work income", () => {
    const result = mapUser(baseInput());
    expect(result.username).toBe("Ada");
    expect(result.skills.energy?.level).toBe(1);
    expect(result.job.netWage).toBe(0.1);
    // energy L1 → value 40 via skillValueFromLevel; actions 9.6; prod 13
    expect(result.income.workGPerDay).toBeCloseTo(9.6 * 13 * 0.1);
    expect(result.income.selfWorkGPerDay).toBe(0);
    expect(result.income.aeGPerDay).toBe(0);
    expect(result.income.totalGPerDay).toBeCloseTo(result.income.workGPerDay);
  });

  it("zeros work when unemployed", () => {
    const result = mapUser(baseInput({ job: { status: "unemployed" } }));
    expect(result.income.workGPerDay).toBe(0);
  });

  it("maps companies with zero profit when prices missing", () => {
    const result = mapUser(
      baseInput({
        packEntries: [
          {
            id: "a",
            name: "A",
            aeLevel: 6,
            itemCode: "iron",
            productionBonus: 0.5,
            regionId: null,
            bonusDetails: null,
          },
        ],
        prices: {},
      }),
    );
    expect(result.companies).toEqual([
      {
        id: "a",
        name: "A",
        aeLevel: 6,
        itemCode: "iron",
        productionBonus: 0.5,
        profitPerPp: 0,
        goldPerAePerDay: 0,
      },
    ]);
    expect(result.income.aeGPerDay).toBe(0);
  });
});
