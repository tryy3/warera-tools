import { describe, expect, it, vi } from "vite-plus/test";
import { fetchBattleOrders, parseBattleOrders } from "./battle-orders";

describe("parseBattleOrders", () => {
  it("parses MU and country orders with Low/High priority", () => {
    const parsed = parseBattleOrders({
      orders: [
        { mu: "mu-1", side: "attacker", priority: "low" },
        { country: "sweden", side: "attacker", priority: "high" },
      ],
    });
    expect(parsed).toEqual([
      { ownerType: "mu", ownerId: "mu-1", side: "attacker", priority: "low", payload: null },
      {
        ownerType: "country",
        ownerId: "sweden",
        side: "attacker",
        priority: "high",
        payload: null,
      },
    ]);
  });

  it("maps numeric priority 2 to medium and drops rows without owner", () => {
    expect(
      parseBattleOrders([{ countryId: "c1", side: "defender", priority: 2 }, { side: "attacker" }]),
    ).toEqual([
      { ownerType: "country", ownerId: "c1", side: "defender", priority: "medium", payload: null },
    ]);
  });

  it("accepts wrapped items and battleOrders", () => {
    expect(parseBattleOrders({ items: [{ muId: "m1", side: "defender", priority: 1 }] })).toEqual([
      { ownerType: "mu", ownerId: "m1", side: "defender", priority: "low", payload: null },
    ]);
    expect(
      parseBattleOrders({ battleOrders: [{ country: "x", side: "attacker", priority: 3 }] }),
    ).toEqual([
      { ownerType: "country", ownerId: "x", side: "attacker", priority: "high", payload: null },
    ]);
  });

  it("skips unknown priority and invalid side", () => {
    expect(
      parseBattleOrders([
        { mu: "m1", side: "attacker", priority: "urgent" },
        { mu: "m2", side: "neutral", priority: "low" },
        { mu: "m3", side: "defender", priority: "medium" },
      ]),
    ).toEqual([
      { ownerType: "mu", ownerId: "m3", side: "defender", priority: "medium", payload: null },
    ]);
  });

  it("maps rank to priority when priority is absent", () => {
    expect(parseBattleOrders([{ rank: 2, countryId: "c1", side: "defender" }])).toEqual([
      { ownerType: "country", ownerId: "c1", side: "defender", priority: "medium", payload: null },
    ]);
    expect(parseBattleOrders([{ rank: 2, countryId: "c1" }], { defaultSide: "attacker" })).toEqual([
      { ownerType: "country", ownerId: "c1", side: "attacker", priority: "medium", payload: null },
    ]);
  });

  it("skips rank 0", () => {
    expect(parseBattleOrders([{ rank: 0, mu: "m1", side: "attacker" }])).toEqual([]);
  });
});

describe("fetchBattleOrders", () => {
  it("fetches attacker and defender sides and concatenates parsed orders", async () => {
    const request = vi.fn().mockImplementation(async (path: string) => {
      const input = JSON.parse(decodeURIComponent(path.split("input=")[1]!)) as {
        battleId: string;
        side: string;
      };
      if (input.side === "attacker") {
        return {
          result: {
            data: {
              orders: [
                { mu: "mu-1", priority: "high" },
                { countryId: "c1", rank: 2 },
              ],
            },
          },
        };
      }
      return {
        result: {
          data: {
            orders: [{ mu: "mu-2", side: "defender", priority: "low" }],
          },
        },
      };
    });
    const warera = { request };
    const parsed = await fetchBattleOrders(warera, "battle-42");
    expect(request).toHaveBeenCalledTimes(2);
    const inputs = request.mock.calls.map((call) =>
      JSON.parse(decodeURIComponent(String(call[0]).split("input=")[1]!)),
    );
    expect(inputs).toEqual(
      expect.arrayContaining([
        { battleId: "battle-42", side: "attacker" },
        { battleId: "battle-42", side: "defender" },
      ]),
    );
    expect(parsed).toEqual([
      { ownerType: "mu", ownerId: "mu-1", side: "attacker", priority: "high", payload: null },
      { ownerType: "country", ownerId: "c1", side: "attacker", priority: "medium", payload: null },
      { ownerType: "mu", ownerId: "mu-2", side: "defender", priority: "low", payload: null },
    ]);
  });
});
