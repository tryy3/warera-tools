import { describe, expect, it } from "vite-plus/test";
import { skillValueFromLevel } from "./values";

describe("skillValueFromLevel", () => {
  it("matches known caps", () => {
    expect(skillValueFromLevel("energy", 2)).toBe(50);
    expect(skillValueFromLevel("entrepreneurship", 2)).toBe(40);
    expect(skillValueFromLevel("production", 3)).toBe(19);
    expect(skillValueFromLevel("companies", 0)).toBe(2);
    expect(skillValueFromLevel("companies", 4)).toBe(6);
  });
});
