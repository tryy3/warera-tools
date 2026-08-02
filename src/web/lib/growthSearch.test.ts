import { describe, expect, it } from "vite-plus/test";
import { buildGrowthSearch, parseGrowthSearch } from "./growthSearch";

describe("parseGrowthSearch", () => {
  it("returns empty when absent or blank", () => {
    expect(parseGrowthSearch({})).toEqual({});
    expect(parseGrowthSearch({ userId: "  ", username: "" })).toEqual({});
  });

  it("trims userId and username", () => {
    expect(parseGrowthSearch({ userId: " abc ", username: " Bob " })).toEqual({
      userId: "abc",
      username: "Bob",
    });
  });
});

describe("buildGrowthSearch", () => {
  it("returns empty when no user selected", () => {
    expect(buildGrowthSearch({ userId: null, username: null })).toEqual({});
  });

  it("includes userId and optional username", () => {
    expect(buildGrowthSearch({ userId: "u1", username: "Alice" })).toEqual({
      userId: "u1",
      username: "Alice",
    });
    expect(buildGrowthSearch({ userId: "u1", username: null })).toEqual({
      userId: "u1",
    });
  });
});
