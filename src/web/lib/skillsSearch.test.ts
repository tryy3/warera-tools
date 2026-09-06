import { describe, expect, it } from "vite-plus/test";
import { buildSkillsSearch } from "./skillsSearch";

describe("buildSkillsSearch", () => {
  it("returns battle tab without userId", () => {
    expect(
      buildSkillsSearch({ userId: null, username: null, tab: "battle" }),
    ).toEqual({ tab: "battle" });
  });

  it("returns empty when no userId and economy/default tab", () => {
    expect(buildSkillsSearch({ userId: null, username: null, tab: "economy" })).toEqual(
      {},
    );
    expect(buildSkillsSearch({ userId: null, username: null })).toEqual({});
  });

  it("includes userId and battle tab when both present", () => {
    expect(
      buildSkillsSearch({ userId: "u1", username: "Alice", tab: "battle" }),
    ).toEqual({
      userId: "u1",
      username: "Alice",
      tab: "battle",
    });
  });

  it("includes userId without tab for economy", () => {
    expect(buildSkillsSearch({ userId: "u1", username: null, tab: "economy" })).toEqual({
      userId: "u1",
    });
  });
});
