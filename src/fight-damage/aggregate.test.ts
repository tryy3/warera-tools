import { describe, expect, it } from "vite-plus/test";
import type { FightKnobs, FightPlayerInput, PillStatus } from "./types";
import { aggregateFightDesk } from "./aggregate";
import { playerDamageFullPill, playerDamageNow } from "./player-damage";

const knobs: FightKnobs = {
  foodId: "none",
  foodBonus: 0,
  battleBonus: 0,
  ticks: 0,
};

function player(userId: string, atk: number, pillStatus: PillStatus): FightPlayerInput {
  return {
    userId,
    atk,
    precision: 1,
    critChance: 0,
    critDamage: 2.66,
    armor: 0,
    dodge: 0,
    hp: 10,
    maxHp: 10,
    hunger: 0,
    maxHunger: 100,
    hpRegenPerHour: 0,
    hungerRegenPerHour: 0,
    pillStatus,
  };
}

describe("aggregateFightDesk", () => {
  it("aggregates selected damage while counting pill states across the roster", () => {
    const ready = player("ready", 100, "ready");
    const active = player("active", 200, "active");
    const debuff = player("debuff", 400, "debuff");
    const players = [ready, active, debuff];

    expect(aggregateFightDesk(players, new Set(["ready", "active"]), knobs)).toEqual({
      now: playerDamageNow(ready, knobs) + playerDamageNow(active, knobs),
      peakPotential: playerDamageFullPill(ready, knobs) + playerDamageFullPill(active, knobs),
      selectedCount: 2,
      avgPerMember: 150,
      topDamage: 200,
      pillCounts: { active: 1, debuff: 1, ready: 1 },
    });
  });

  it("returns zeroed selected metrics when no players are selected", () => {
    expect(aggregateFightDesk([player("ready", 100, "ready")], new Set(), knobs)).toEqual({
      now: 0,
      peakPotential: 0,
      selectedCount: 0,
      avgPerMember: 0,
      topDamage: 0,
      pillCounts: { active: 0, debuff: 0, ready: 1 },
    });
  });

  it("uses peaksByUserId Full-pill inputs when provided", () => {
    const current = player("ready", 100, "ready");
    const peak = player("ready", 500, "debuff");

    const result = aggregateFightDesk(
      [current],
      new Set(["ready"]),
      knobs,
      new Map([["ready", peak]]),
    );

    expect(result.now).toBe(playerDamageNow(current, knobs));
    expect(result.peakPotential).toBe(playerDamageFullPill(peak, knobs));
  });
});
