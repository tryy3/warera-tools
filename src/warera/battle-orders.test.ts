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
      { ownerType: "country", ownerId: "sweden", side: "attacker", priority: "high", payload: null },
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
});

describe("fetchBattleOrders", () => {
  it("calls battleOrder.getByBattle and parses result", async () => {
    const request = vi.fn().mockResolvedValue({
      result: {
        data: {
          orders: [{ mu: "mu-1", side: "attacker", priority: "high" }],
        },
      },
    });
    const warera = { request };
    const parsed = await fetchBattleOrders(warera, "battle-42");
    expect(request).toHaveBeenCalledWith(
      `battleOrder.getByBattle?input=${encodeURIComponent(JSON.stringify({ battleId: "battle-42" }))}`,
    );
    expect(parsed).toEqual([
      { ownerType: "mu", ownerId: "mu-1", side: "attacker", priority: "high", payload: null },
    ]);
  });
});
