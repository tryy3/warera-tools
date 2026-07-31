import { describe, expect, it } from "vite-plus/test";
import { buildEconomySearch, parseEconomySearch } from "./economySearch";

describe("parseEconomySearch", () => {
  it("returns empty when absent or blank", () => {
    expect(parseEconomySearch({})).toEqual({});
    expect(parseEconomySearch({ userId: "  ", username: "" })).toEqual({});
  });

  it("trims userId and username", () => {
    expect(parseEconomySearch({ userId: " abc ", username: " Bob " })).toEqual({
      userId: "abc",
      username: "Bob",
    });
  });
});

describe("buildEconomySearch", () => {
  it("returns empty when no user selected", () => {
    expect(buildEconomySearch({ userId: null, username: null })).toEqual({});
  });

  it("includes userId and optional username", () => {
    expect(buildEconomySearch({ userId: "u1", username: "Alice" })).toEqual({
      userId: "u1",
      username: "Alice",
    });
    expect(buildEconomySearch({ userId: "u1", username: null })).toEqual({
      userId: "u1",
    });
  });
});
