import { describe, expect, it } from "vite-plus/test";
import type { FightKnobs, FightPlayerInput, PillStatus } from "./types";
import { aggregateFightDesk } from "./aggregate";
import { playerDamageIfPill, playerDamageNow } from "./player-damage";

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
      fullPillPotential: playerDamageIfPill(ready, knobs) + playerDamageIfPill(active, knobs),
      selectedCount: 2,
      avgPerMember: 1500,
      topDamage: 2000,
      pillCounts: { active: 1, debuff: 1, ready: 1 },
    });
  });

  it("returns zeroed selected metrics when no players are selected", () => {
    expect(aggregateFightDesk([player("ready", 100, "ready")], new Set(), knobs)).toEqual({
      now: 0,
      fullPillPotential: 0,
      selectedCount: 0,
      avgPerMember: 0,
      topDamage: 0,
      pillCounts: { active: 0, debuff: 0, ready: 1 },
    });
  });
});
