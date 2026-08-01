import { describe, expect, it } from "vite-plus/test";
import { parseWareraCountries } from "./countries";

describe("parseWareraCountries", () => {
  it("maps code and market tax percent to fraction", () => {
    const rows = parseWareraCountries({
      result: {
        data: [
          {
            _id: "6813b6d446e731854c7ac7f2",
            name: "Sweden",
            code: "se",
            taxes: { income: 7, market: 1, selfWork: 1 },
          },
        ],
      },
    });
    expect(rows).toEqual([
      {
        id: "6813b6d446e731854c7ac7f2",
        name: "Sweden",
        isoCode: "SE",
        taxRate: 0.01,
      },
    ]);
  });

  it("skips entries missing id/name/code", () => {
    expect(
      parseWareraCountries({
        result: { data: [{ name: "X", taxes: { market: 1 } }] },
      }),
    ).toEqual([]);
  });
});
