import { describe, expect, it } from "vite-plus/test";
import {
  FIGHT_SKILL_IDS,
  emptyFightLevels,
  fightLevelsFromUserSkills,
  spentNonFightSp,
} from "./fight-skills";

describe("fightLevelsFromUserSkills", () => {
  it("reads known keys and defaults missing to 0", () => {
    expect(fightLevelsFromUserSkills({ attack: { level: 5 }, energy: { level: 3 } })).toMatchObject({
      attack: 5,
      precision: 0,
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
