import { describe, expect, it } from "vite-plus/test";
import { classifyBuildFromSkillLevels } from "./classify";

describe("classifyBuildFromSkillLevels", () => {
  it("classifies eco when eco SP dominates", () => {
    expect(
      classifyBuildFromSkillLevels({
        energy: { level: 5 },
        production: { level: 3 },
        attack: { level: 1 },
      }),
    ).toBe("eco");
  });

  it("classifies war when fight SP dominates", () => {
    expect(
      classifyBuildFromSkillLevels({
        energy: { level: 1 },
        attack: { level: 10 },
        precision: { level: 5 },
      }),
    ).toBe("war");
  });

  it("ties go to war", () => {
    // craft equal SP on both sides for the assertion
    expect(
      classifyBuildFromSkillLevels({
        energy: { level: 2 }, // SP = 3
        attack: { level: 2 }, // SP = 3
      }),
    ).toBe("war");
  });

  it("returns unknown when no usable levels", () => {
    expect(classifyBuildFromSkillLevels({})).toBe("unknown");
  });
});
