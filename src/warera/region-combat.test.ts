import { describe, expect, it } from "vite-plus/test";
import { computeDefenderSupplyLinked, parseRegionCombat } from "./region-combat";

describe("parseRegionCombat", () => {
  it("parses bunker, military base, neighbors, owner, and core flag", () => {
    expect(
      parseRegionCombat({
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
});
