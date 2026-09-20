import { describe, expect, it } from "vite-plus/test";
import {
  computeAllianceWorldShare,
  parseCountryCapitalRegionId,
  parseCountryDiplomacy,
  parseWorldDevelopment,
} from "./diplomacy";

describe("parseCountryDiplomacy", () => {
  it("parses alliance, sworn enemy, and defensive pacts with since", () => {
    const since = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString();
    const parsed = parseCountryDiplomacy({
      alliance: "ally-1",
      swornEnemy: { country: "enemy-9", since: "2026-09-01T00:00:00.000Z" },
      defensivePacts: [{ countryId: "pact-a", since }],
    });
    expect(parsed).toEqual({
      allianceId: "ally-1",
      swornEnemyId: "enemy-9",
      swornEnemySince: new Date("2026-09-01T00:00:00.000Z"),
      pacts: [{ countryId: "pact-a", since }],
    });
  });

  it("returns nulls for missing diplomacy fields", () => {
    expect(parseCountryDiplomacy({})).toEqual({
      allianceId: null,
      swornEnemyId: null,
      swornEnemySince: null,
      pacts: [],
    });
  });
});

describe("parseCountryCapitalRegionId", () => {
  it("reads capitalRegionId and capital aliases", () => {
    expect(parseCountryCapitalRegionId({ capitalRegionId: "cap-r" })).toBe("cap-r");
    expect(parseCountryCapitalRegionId({ capital: "cap-r2" })).toBe("cap-r2");
  });
});

describe("parseWorldDevelopment and alliance share", () => {
  it("computes alliance share from alliance totals", () => {
    const world = parseWorldDevelopment({
      totalDevelopment: 1000,
      alliances: [
        { _id: "a1", development: 250 },
        { _id: "a2", development: 750 },
      ],
    });
    expect(computeAllianceWorldShare(world, "a1")).toBe(0.25);
    expect(computeAllianceWorldShare(world, "missing")).toBeNull();
  });
});
