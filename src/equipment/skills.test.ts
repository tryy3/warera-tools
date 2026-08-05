import { describe, expect, it } from "vite-plus/test";
import {
  lowestObservedSkills,
  matchesSkillBands,
  parseSkillNumbers,
} from "./skills";

describe("parseSkillNumbers", () => {
  it("keeps finite numbers only", () => {
    expect(parseSkillNumbers({ armor: 22, junk: "x", n: NaN })).toEqual({ armor: 22 });
    expect(parseSkillNumbers(null)).toBeNull();
    expect(parseSkillNumbers({})).toBeNull();
  });
});

describe("matchesSkillBands", () => {
  it("ANDs inclusive bands", () => {
    const skills = { attack: 89, criticalChance: 13 };
    expect(
      matchesSkillBands(skills, [
        { key: "attack", target: 89, band: 1 },
        { key: "criticalChance", target: 13, band: 1 },
      ]),
    ).toBe(true);
    expect(
      matchesSkillBands(skills, [
        { key: "attack", target: 89, band: 0 },
        { key: "criticalChance", target: 12, band: 0 },
      ]),
    ).toBe(false);
  });

  it("fails when a required skill key is missing", () => {
    expect(
      matchesSkillBands({ attack: 89 }, [{ key: "criticalChance", target: 13, band: 1 }]),
    ).toBe(false);
  });
});

describe("lowestObservedSkills", () => {
  it("takes per-key minimum across rows", () => {
    expect(
      lowestObservedSkills([
        { attack: 90, criticalChance: 14 },
        { attack: 85, criticalChance: 16 },
      ]),
    ).toEqual({ attack: 85, criticalChance: 14 });
  });

  it("returns null when empty", () => {
    expect(lowestObservedSkills([])).toBeNull();
  });
});
