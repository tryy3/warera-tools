import { describe, expect, it } from "vite-plus/test";
import { relevantStickyMuIds } from "./relevance";

describe("relevantStickyMuIds", () => {
  it("sticks watched MUs on muOrders or matching countryOrders", () => {
    const battle = {
      attacker: { muOrders: ["mu-a"], countryOrders: ["sweden"] },
      defender: { muOrders: [] as string[], countryOrders: [] as string[] },
    };
    expect(
      relevantStickyMuIds(battle, [
        { muId: "mu-a", countryId: "iran" },
        { muId: "mu-se", countryId: "sweden" },
        { muId: "mu-other", countryId: "chile" },
      ]),
    ).toEqual(["mu-a", "mu-se"]);
  });

  it("returns sorted stable mu ids", () => {
    const battle = {
      attacker: { muOrders: ["mu-z"], countryOrders: ["alpha"] },
      defender: { muOrders: ["mu-a"], countryOrders: ["beta"] },
    };
    expect(
      relevantStickyMuIds(battle, [
        { muId: "mu-z", countryId: null },
        { muId: "mu-a", countryId: null },
        { muId: "mu-beta", countryId: "beta" },
        { muId: "mu-alpha", countryId: "alpha" },
      ]),
    ).toEqual(["mu-a", "mu-alpha", "mu-beta", "mu-z"]);
  });

  it("does not match country orders when countryId is null", () => {
    const battle = {
      attacker: { muOrders: [] as string[], countryOrders: ["sweden"] },
      defender: { muOrders: [] as string[], countryOrders: [] as string[] },
    };
    expect(relevantStickyMuIds(battle, [{ muId: "mu-x", countryId: null }])).toEqual([]);
  });

  it("lists each mu id once when matched by mu and country rules", () => {
    const battle = {
      attacker: { muOrders: ["mu-dup"], countryOrders: ["norway"] },
      defender: { muOrders: [] as string[], countryOrders: [] as string[] },
    };
    expect(relevantStickyMuIds(battle, [{ muId: "mu-dup", countryId: "norway" }])).toEqual([
      "mu-dup",
    ]);
  });
});
