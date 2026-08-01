import { describe, expect, it } from "vite-plus/test";
import { parseMarketItemSearch } from "./marketSearch";

describe("parseMarketItemSearch", () => {
  it("parses valid ranges", () => {
    expect(parseMarketItemSearch({ range: "24h" })).toEqual({ range: "24h" });
    expect(parseMarketItemSearch({ range: "7d" })).toEqual({ range: "7d" });
    expect(parseMarketItemSearch({ range: "30d" })).toEqual({ range: "30d" });
  });

  it("defaults invalid or missing range to 7d", () => {
    expect(parseMarketItemSearch({})).toEqual({ range: "7d" });
    expect(parseMarketItemSearch({ range: "1y" })).toEqual({ range: "7d" });
    expect(parseMarketItemSearch({ range: 7 })).toEqual({ range: "7d" });
  });
});
