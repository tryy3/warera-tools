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
        coreDevelopment: null,
        allianceId: null,
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

  it("reads coreDevelopment and allianceId from getAllCountries", () => {
    const rows = parseWareraCountries({
      result: {
        data: [
          {
            _id: "sweden",
            name: "Sweden",
            code: "se",
            taxes: { market: 1 },
            coreDevelopment: 574.07,
            allianceId: "forge",
          },
        ],
      },
    });
    expect(rows[0]).toMatchObject({
      coreDevelopment: 574.07,
      allianceId: "forge",
    });
  });

  it("skips entries when taxes.market is missing or not finite", () => {
    expect(
      parseWareraCountries({
        result: {
          data: [
            { _id: "a", name: "NoTaxes", code: "xx" },
            { _id: "b", name: "NoMarket", code: "yy", taxes: { income: 7 } },
            { _id: "c", name: "BadMarket", code: "zz", taxes: { market: Number.NaN } },
            {
              _id: "d",
              name: "Ok",
              code: "ok",
              taxes: { market: 2 },
            },
          ],
        },
      }),
    ).toEqual([
      {
        id: "d",
        name: "Ok",
        isoCode: "OK",
        taxRate: 0.02,
        coreDevelopment: null,
        allianceId: null,
      },
    ]);
  });
});
