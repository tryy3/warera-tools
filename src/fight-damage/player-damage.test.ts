import { describe, expect, it } from "vite-plus/test";
import type { FightKnobs, FightPlayerInput, PillStatus } from "./types";
import { playerDamageIfPill, playerDamageNow } from "./player-damage";

const knobs: FightKnobs = {
  foodId: "steak",
  foodBonus: 0.15,
  battleBonus: 0.1,
  ticks: 2,
};

function player(pillStatus: PillStatus): FightPlayerInput {
  return {
    userId: pillStatus,
    atk: 100,
    precision: 1,
    critChance: 0,
    critDamage: 2.66,
    armor: 0,
    dodge: 0,
    hp: 50,
    maxHp: 100,
    hunger: 10,
    maxHunger: 100,
    hpRegenPerHour: 10,
    hungerRegenPerHour: 5,
    pillStatus,
  };
}

describe("playerDamageNow", () => {
  it("uses projected resources, food conversion, and battle bonus", () => {
    expect(playerDamageNow(player("ready"), knobs)).toBeCloseTo(40700);
  });
});

describe("playerDamageIfPill", () => {
  it("uplifts attack for a ready player", () => {
    const input = player("ready");
    expect(playerDamageIfPill(input, knobs)).toBeGreaterThan(playerDamageNow(input, knobs));
  });

  it.each(["active", "debuff"] as const)("does not uplift a %s player", (pillStatus) => {
    const input = player(pillStatus);
    expect(playerDamageIfPill(input, knobs)).toBe(playerDamageNow(input, knobs));
  });
});
