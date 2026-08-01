import { describe, expect, it, vi } from "vite-plus/test";
import {
  extractCompanyIds,
  fetchCompanyProductionBonus,
  parseCompany,
  parseRecommendedRegions,
  parseRegionInfo,
} from "./companies";

describe("extractCompanyIds", () => {
  it("reads string ids from items", () => {
    expect(
      extractCompanyIds({
        items: ["abc", "def"],
      }),
    ).toEqual(["abc", "def"]);
  });

  it("reads ids from object items", () => {
    expect(
      extractCompanyIds({
        items: [{ _id: "abc", name: "A" }, { id: "def" }],
      }),
    ).toEqual(["abc", "def"]);
  });
});

describe("parseCompany", () => {
  it("parses live getById shape", () => {
    const company = parseCompany({
      _id: "6a29dc47f157d40728bcd38c",
      user: "6a1feb0f0f195216e3571c58",
      region: "6813b70d9403bc4170a5db6a",
      itemCode: "lead",
      name: "Pew pew pew",
      activeUpgradeLevels: {
        storage: 2,
        automatedEngine: 6,
        breakRoom: 1,
      },
    });
    expect(company).toEqual({
      id: "6a29dc47f157d40728bcd38c",
      name: "Pew pew pew",
      itemCode: "lead",
      regionId: "6813b70d9403bc4170a5db6a",
      regionName: null,
      regionCountryCode: null,
      aeLevel: 6,
      productionBonus: null,
    });
  });
});

describe("parseRegionInfo", () => {
  it("reads countryCode from region.getById shape", () => {
    expect(
      parseRegionInfo({
        name: "Turkistan",
        countryCode: "kz",
        country: "6813…",
      }),
    ).toEqual({ name: "Turkistan", countryCode: "kz" });
  });

  it("falls back to mainCity and null countryCode", () => {
    expect(parseRegionInfo({ mainCity: "Somewhere" })).toEqual({
      name: "Somewhere",
      countryCode: null,
    });
  });

  it("returns nulls for non-objects", () => {
    expect(parseRegionInfo(null)).toEqual({ name: null, countryCode: null });
  });
});

describe("parseRecommendedRegions", () => {
  it("parses ranked id strings", () => {
    expect(
      parseRecommendedRegions({
        result: { data: ["reg-a", "reg-b"] },
      }),
    ).toEqual([
      { regionId: "reg-a", regionName: null, bonus: 0 },
      { regionId: "reg-b", regionName: null, bonus: 0 },
    ]);
  });

  it("parses objects with percent bonuses", () => {
    expect(
      parseRecommendedRegions({
        result: {
          data: [{ regionId: "reg-a", name: "Somewhere", total: 50.5 }],
        },
      }),
    ).toEqual([{ regionId: "reg-a", regionName: "Somewhere", bonus: 0.505 }]);
  });
});

describe("fetchCompanyProductionBonus", () => {
  it("calls api2 directly (skips gateway)", async () => {
    const request = vi.fn(async () => ({
      result: {
        data: {
          total: 50.5,
          strategicBonus: 10,
          depositBonus: 20,
          ethicSpecializationBonus: 15,
          ethicDepositBonus: 5.5,
        },
      },
    }));
    await fetchCompanyProductionBonus({ request } as never, "company-1");
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("company.getProductionBonus"),
      expect.objectContaining({ baseUrl: "https://api2.warera.io/trpc" }),
    );
  });
});
