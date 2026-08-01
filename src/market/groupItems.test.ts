import { describe, expect, it } from "vite-plus/test";
import { groupMarketItems, marketItemGroup } from "./groupItems";

describe("marketItemGroup", () => {
  it("classifies recipe items", () => {
    expect(marketItemGroup("grain")).toBe("raw");
    expect(marketItemGroup("steel")).toBe("manufactured");
    expect(marketItemGroup("scraps")).toBe("other");
  });
});

describe("groupMarketItems", () => {
  it("buckets and preserves order within groups", () => {
    const items = [
      { itemCode: "steel" },
      { itemCode: "grain" },
      { itemCode: "scraps" },
      { itemCode: "iron" },
    ];
    expect(groupMarketItems(items)).toEqual({
      raw: [{ itemCode: "grain" }, { itemCode: "iron" }],
      manufactured: [{ itemCode: "steel" }],
      other: [{ itemCode: "scraps" }],
    });
  });
});
