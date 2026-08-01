import { describe, expect, it } from "vite-plus/test";
import { buildCompaniesSearch, parseCompaniesSearch } from "./companiesSearch";

describe("parseCompaniesSearch", () => {
  it("returns empty when absent or blank", () => {
    expect(parseCompaniesSearch({})).toEqual({});
    expect(parseCompaniesSearch({ userId: "  ", username: "" })).toEqual({});
  });

  it("trims userId and username", () => {
    expect(parseCompaniesSearch({ userId: " abc ", username: " Bob " })).toEqual({
      userId: "abc",
      username: "Bob",
    });
  });
});

describe("buildCompaniesSearch", () => {
  it("returns empty when no user selected", () => {
    expect(buildCompaniesSearch({ userId: null, username: null })).toEqual({});
  });

  it("includes userId and optional username", () => {
    expect(buildCompaniesSearch({ userId: "u1", username: "Alice" })).toEqual({
      userId: "u1",
      username: "Alice",
    });
    expect(buildCompaniesSearch({ userId: "u1", username: null })).toEqual({
      userId: "u1",
    });
  });
});
