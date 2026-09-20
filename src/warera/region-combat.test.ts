import { describe, expect, it } from "vite-plus/test";
import { computeDefenderSupplyLinked, parseRegionCombat } from "./region-combat";

describe("parseRegionCombat", () => {
  it("parses bunker, military base, neighbors, owner, and core flag", () => {
    expect(
      parseRegionCombat({
        name: "Crete",
        countryCode: "GR",
        countryId: "c-def",
        isCore: true,
        resistance: 0.42,
        neighbors: ["r2"],
        bunker: { level: 4, active: true },
        militaryBase: { level: 2, active: false },
      }),
    ).toEqual({
      bunkerLevel: 4,
      bunkerActive: true,
      militaryBaseLevel: 2,
      militaryBaseActive: false,
      resistance: 0.42,
      neighborRegionIds: ["r2"],
      ownerCountryId: "c-def",
      isCore: true,
      name: "Crete",
      countryCode: "GR",
    });
  });

  it("keeps name from mainCity when name is absent", () => {
    expect(parseRegionCombat({ mainCity: "Iraklion", countryCode: "GR" })).toMatchObject({
      name: "Iraklion",
      countryCode: "GR",
    });
  });
});

describe("computeDefenderSupplyLinked", () => {
  const graph = (
    entries: Array<{
      id: string;
      owner: string;
      neighbors: string[] | null;
    }>,
  ) =>
    new Map(
      entries.map((e) => [
        e.id,
        {
          regionId: e.id,
          ownerCountryId: e.owner,
          neighborRegionIds: e.neighbors,
        },
      ]),
    );

  it("returns true when capital is reachable through same-owner neighbors", () => {
    const linked = computeDefenderSupplyLinked(
      "r1",
      "r2",
      graph([
        { id: "r1", owner: "c1", neighbors: ["r2"] },
        { id: "r2", owner: "c1", neighbors: [] },
      ]),
    );
    expect(linked).toBe(true);
  });

  it("returns false when only foreign-owned neighbors are known", () => {
    const linked = computeDefenderSupplyLinked(
      "r1",
      "r2",
      graph([
        { id: "r1", owner: "c1", neighbors: ["r3"] },
        { id: "r3", owner: "c-other", neighbors: ["r2"] },
        { id: "r2", owner: "c1", neighbors: [] },
      ]),
    );
    expect(linked).toBe(false);
  });

  it("returns null when capital is missing", () => {
    expect(computeDefenderSupplyLinked("r1", null, graph([]))).toBeNull();
  });

  it("returns null when a listed neighbor is missing from the graph map", () => {
    expect(
      computeDefenderSupplyLinked(
        "r1",
        "r-cap",
        graph([{ id: "r1", owner: "c1", neighbors: ["r-missing"] }]),
      ),
    ).toBeNull();
  });

  it("returns false when same-owner component is exhausted without reaching capital", () => {
    expect(
      computeDefenderSupplyLinked(
        "r-def",
        "r-cap",
        graph([
          { id: "r-def", owner: "c1", neighbors: ["r-mid"] },
          { id: "r-mid", owner: "c1", neighbors: [] },
        ]),
      ),
    ).toBe(false);
  });

  it("returns true when defender directly neighbors the capital (same owner)", () => {
    expect(
      computeDefenderSupplyLinked(
        "r-def",
        "r-cap",
        graph([
          { id: "r-def", owner: "c1", neighbors: ["r-cap"] },
          { id: "r-cap", owner: "c1", neighbors: [] },
        ]),
      ),
    ).toBe(true);
  });
});
