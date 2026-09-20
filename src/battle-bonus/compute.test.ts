import { describe, expect, it } from "vite-plus/test";
import { computeBattleBonus, customBattleBonus } from "./compute";
import type { BattleBonusFacts } from "./types";

function facts(patch: Partial<BattleBonusFacts> = {}): BattleBonusFacts {
  return {
    fightSide: "attacker",
    muCountryId: "sweden",
    attackerCountryId: "iran",
    defenderCountryId: "egypt",
    isRevolt: false,
    countryOrderPriority: null,
    muOrderPriority: null,
    hqLevel: 3,
    hqRunning: false,
    allianceWorldShare: null,
    supportingAllianceMember: null,
    defendingPactPartner: null,
    swornEnemy: null,
    bunkerLevel: null,
    bunkerActive: null,
    militaryBaseLevel: null,
    militaryBaseActive: false,
    resistance: null,
    defenderSupplyLinked: true,
    alliedFortHalf: false,
    ...patch,
  };
}

function amount(
  result: ReturnType<typeof computeBattleBonus>,
  id: string,
): number | null | undefined {
  return result.parts.find((p) => p.id === id)?.amount;
}

function status(result: ReturnType<typeof computeBattleBonus>, id: string) {
  return result.parts.find((p) => p.id === id)?.status;
}

describe("computeBattleBonus", () => {
  it("applies Low MU order as +5% and does not invent High", () => {
    const result = computeBattleBonus(facts({ muOrderPriority: "low" }));
    expect(amount(result, "mu_order")).toBe(0.05);
    expect(result.total).toBeCloseTo(0.05);
  });

  it("stacks country High + MU Low", () => {
    const result = computeBattleBonus(
      facts({ countryOrderPriority: "high", muOrderPriority: "low" }),
    );
    expect(amount(result, "country_order")).toBe(0.15);
    expect(amount(result, "mu_order")).toBe(0.05);
    expect(result.total).toBeCloseTo(0.2);
  });

  it("applies patriotic when MU country is a side", () => {
    const result = computeBattleBonus(facts({ muCountryId: "iran" }));
    expect(amount(result, "patriotic")).toBe(0.2);
    expect(status(result, "patriotic")).toBe("applied");
  });

  it("marks HQ off when not running even if level is 3", () => {
    const result = computeBattleBonus(facts({ hqLevel: 3, hqRunning: false }));
    expect(status(result, "hq")).toBe("off");
    expect(amount(result, "hq")).toBe(0);
    expect(result.total).toBe(0);
  });

  it("applies HQ +15% at running level 3", () => {
    const result = computeBattleBonus(facts({ hqLevel: 3, hqRunning: true }));
    expect(amount(result, "hq")).toBe(0.15);
  });

  it("treats unknown HQ running as unknown, not as on", () => {
    const result = computeBattleBonus(facts({ hqLevel: 4, hqRunning: null }));
    expect(status(result, "hq")).toBe("unknown");
    expect(result.total).toBe(0);
  });

  it("applies supply-line −25% only when defending and unlinked", () => {
    const hit = computeBattleBonus(facts({ fightSide: "defender", defenderSupplyLinked: false }));
    expect(amount(hit, "supply_line")).toBe(-0.25);
    const unknown = computeBattleBonus(
      facts({ fightSide: "defender", defenderSupplyLinked: null }),
    );
    expect(status(unknown, "supply_line")).toBe("unknown");
    expect(unknown.total).toBe(0);
  });

  it("ramps defensive pact by age days, capped at +10%", () => {
    const result = computeBattleBonus(facts({ defendingPactPartner: { ageDays: 12 } }));
    expect(amount(result, "defensive_pact")).toBe(0.1);
  });

  it("excludes unknown alliance share from total", () => {
    const result = computeBattleBonus(facts({ allianceWorldShare: null }));
    expect(status(result, "alliance")).toBe("unknown");
    expect(result.total).toBe(0);
  });

  it("applies alliance curve when supporting an alliance member with a known share", () => {
    const result = computeBattleBonus(
      facts({ supportingAllianceMember: true, allianceWorldShare: 0.1 }),
    );
    expect(status(result, "alliance")).toBe("applied");
    expect(amount(result, "alliance")).toBe(0.1);
    expect(result.total).toBeCloseTo(0.1);
  });

  it("turns alliance off when not supporting an alliance member even if share is known", () => {
    const result = computeBattleBonus(
      facts({ supportingAllianceMember: false, allianceWorldShare: 0.1 }),
    );
    expect(status(result, "alliance")).toBe("off");
    expect(amount(result, "alliance")).toBe(0);
    expect(result.total).toBe(0);
  });

  it("keeps alliance unknown when support is unknown even if share is known", () => {
    const result = computeBattleBonus(
      facts({ supportingAllianceMember: null, allianceWorldShare: 0.1 }),
    );
    expect(status(result, "alliance")).toBe("unknown");
    expect(amount(result, "alliance")).toBeNull();
    expect(result.total).toBe(0);
  });

  it("keeps alliance unknown when supporting but share is missing", () => {
    const result = computeBattleBonus(
      facts({ supportingAllianceMember: true, allianceWorldShare: null }),
    );
    expect(status(result, "alliance")).toBe("unknown");
    expect(amount(result, "alliance")).toBeNull();
  });

  it("treats unknown bunker active as unknown, not off", () => {
    const result = computeBattleBonus(
      facts({ fightSide: "defender", bunkerActive: null, bunkerLevel: 3 }),
    );
    expect(status(result, "bunker")).toBe("unknown");
    expect(amount(result, "bunker")).toBeNull();
    expect(result.total).toBe(0);
  });
});

describe("customBattleBonus", () => {
  it("passthrough typed fraction with a custom part", () => {
    expect(customBattleBonus(0.6)).toEqual({
      total: 0.6,
      parts: [{ id: "custom", label: "Custom", amount: 0.6, status: "applied" }],
    });
  });
});
