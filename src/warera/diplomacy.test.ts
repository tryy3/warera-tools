import { describe, expect, it } from "vite-plus/test";
import {
  computeAllianceWorldShare,
  parseAllianceDevelopments,
  parseCountryCapitalRegionId,
  parseCountryDiplomacy,
  parseCountryRecord,
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

  it("reads nested alliance and pact country ids", () => {
    const parsed = parseCountryDiplomacy({
      alliance: { _id: "forge", name: "Forge Alliance" },
      defensivePacts: [{ country: { _id: "iran" }, since: "2026-09-01T00:00:00.000Z" }],
    });
    expect(parsed.allianceId).toBe("forge");
    expect(parsed.pacts).toEqual([{ countryId: "iran", since: "2026-09-01T00:00:00.000Z" }]);
  });

  it("reads live diplomacy partner/enemy rows that omit since", () => {
    const parsed = parseCountryDiplomacy({
      swornEnemy: { enemy: "enemy-9", bonusPercent: 10, damagesDealt: 1 },
      defensivePacts: [{ partner: "iran", bonusPercent: 10, damagesDealt: 2 }],
    });
    expect(parsed.swornEnemyId).toBe("enemy-9");
    expect(parsed.pacts).toEqual([{ countryId: "iran", since: null }]);
  });
});

describe("parseCountryCapitalRegionId", () => {
  it("reads capitalRegionId and capital aliases", () => {
    expect(parseCountryCapitalRegionId({ capitalRegionId: "cap-r" })).toBe("cap-r");
    expect(parseCountryCapitalRegionId({ capital: "cap-r2" })).toBe("cap-r2");
  });

  it("reads allianceId from country.getCountryById", () => {
    expect(parseCountryCapitalRegionId({ allianceId: "forge" })).toBeNull();
    expect(parseCountryRecord({ allianceId: "forge", capitalRegionId: "cap-r" })).toEqual({
      capitalRegionId: "cap-r",
      allianceId: "forge",
    });
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

  it("parses a numeric world-development total", () => {
    expect(parseWorldDevelopment(18045.34)).toEqual({
      totalDevelopment: 18045.34,
      allianceDevelopmentById: new Map(),
    });
  });

  it("reads alliance currentDevelopment from paginated items", () => {
    const world = parseAllianceDevelopments({
      items: [{ _id: "forge", currentDevelopment: 2014.44 }],
    });
    expect(world.get("forge")).toBe(2014.44);
    expect(
      computeAllianceWorldShare(
        { totalDevelopment: 18045.34, allianceDevelopmentById: world },
        "forge",
      ),
    ).toBeCloseTo(2014.44 / 18045.34);
  });

  it("prefers alliance coreDevelopment over currentDevelopment", () => {
    const world = parseAllianceDevelopments({
      items: [{ _id: "forge", coreDevelopment: 1354.29, currentDevelopment: 2013.99 }],
    });
    expect(world.get("forge")).toBe(1354.29);
  });
});
