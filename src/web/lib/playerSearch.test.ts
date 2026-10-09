import { describe, expect, it } from "vite-plus/test";
import { buildPlayerSearch, parsePlayerSearch } from "./playerSearch";

describe("parsePlayerSearch", () => {
  it("returns empty when absent, blank or not strings", () => {
    expect(parsePlayerSearch({})).toEqual({});
    expect(parsePlayerSearch({ userId: "  ", username: 3 })).toEqual({});
  });

  it("trims userId and username", () => {
    expect(parsePlayerSearch({ userId: " abc ", username: " Bob " })).toEqual({
      userId: "abc",
      username: "Bob",
    });
  });
});

describe("buildPlayerSearch", () => {
  it("returns empty without a user", () => {
    expect(buildPlayerSearch({ userId: null, username: "x" })).toEqual({});
  });

  it("includes the username only when known", () => {
    expect(buildPlayerSearch({ userId: "u1", username: "Alice" })).toEqual({
      userId: "u1",
      username: "Alice",
    });
    expect(buildPlayerSearch({ userId: "u1", username: null })).toEqual({ userId: "u1" });
  });
});
