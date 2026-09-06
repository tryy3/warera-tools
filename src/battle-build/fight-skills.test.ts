import { describe, expect, it } from "vite-plus/test";
import { FIGHT_SKILL_IDS, fightLevelsFromUserSkills, spentNonFightSp } from "./fight-skills";

describe("fightLevelsFromUserSkills", () => {
  it("reads known keys and defaults missing to 0", () => {
    expect(fightLevelsFromUserSkills({ attack: { level: 5 }, energy: { level: 3 } })).toMatchObject({
      attack: 5,
      precision: 0,
    });
  });

  it("maps alternate API spellings to canonical fight skills", () => {
    expect(
      fightLevelsFromUserSkills({
        critChance: { level: 11 },
        critDamage: { level: 12 },
        critDamages: { level: 13 },
        loot: { level: 14 },
      }),
    ).toMatchObject({
      criticalChance: 11,
      criticalDamages: 13,
      lootChance: 14,
    });
  });

  it("prefers canonical keys over aliases", () => {
    expect(
      fightLevelsFromUserSkills({
        criticalChance: { level: 21 },
        critChance: { level: 99 },
        criticalDamages: { level: 22 },
        critDamage: { level: 98 },
        lootChance: { level: 23 },
        loot: { level: 97 },
      }),
    ).toMatchObject({
      criticalChance: 21,
      criticalDamages: 22,
      lootChance: 23,
    });
  });
});

describe("spentNonFightSp", () => {
  it("counts eco spend only", () => {
    // energy 2 = 3 SP; attack 2 ignored
    expect(
      spentNonFightSp({
        energy: { level: 2 },
        attack: { level: 2 },
      }),
    ).toBe(3);
  });
});

describe("FIGHT_SKILL_IDS", () => {
  it("has nine skills", () => {
    expect(FIGHT_SKILL_IDS).toHaveLength(9);
  });
});
