import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_CALC_TIER,
  buildCalculatorSearch,
  parseCalculatorSearch,
} from "./calculatorSearch";

describe("parseCalculatorSearch", () => {
  it("returns empty object when nothing valid is present", () => {
    expect(parseCalculatorSearch({})).toEqual({});
    expect(parseCalculatorSearch({ tier: "green" })).toEqual({ tier: "green" });
    expect(parseCalculatorSearch({ tier: "nope" })).toEqual({});
    expect(parseCalculatorSearch({ price: "abc" })).toEqual({});
    expect(parseCalculatorSearch({ price: "" })).toEqual({});
  });

  it("accepts valid tier, country, and numeric price", () => {
    expect(
      parseCalculatorSearch({
        tier: "blue",
        country: "sweden",
        price: "3.9",
      }),
    ).toEqual({ tier: "blue", country: "sweden", price: "3.9" });
  });
});

describe("buildCalculatorSearch", () => {
  it("omits defaults and empty price", () => {
    expect(
      buildCalculatorSearch({
        tier: DEFAULT_CALC_TIER,
        countryId: "sweden",
        inclPrice: "",
        defaultCountryId: "sweden",
      }),
    ).toEqual({});
  });

  it("includes only non-default / non-empty fields", () => {
    expect(
      buildCalculatorSearch({
        tier: "blue",
        countryId: "norway",
        inclPrice: "2.5",
        defaultCountryId: "sweden",
      }),
    ).toEqual({ tier: "blue", country: "norway", price: "2.5" });
  });
});
