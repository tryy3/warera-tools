import { describe, expect, it } from "vite-plus/test";
import type { FightKnobs, FightPlayerInput, PillStatus } from "./types";
import {
  playerDamageFullPill,
  playerDamageIfPill,
  playerDamageNow,
  withFullResources,
} from "./player-damage";

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

describe("withFullResources", () => {
  it("sets hp and hunger to their maxima", () => {
    expect(withFullResources(player("debuff"))).toMatchObject({
      hp: 100,
      hunger: 100,
      maxHp: 100,
      maxHunger: 100,
    });
  });
});

describe("playerDamageFullPill", () => {
  it("applies pill ATK bonus even when status is debuff", () => {
    const debuff = player("debuff");
    const expected = playerDamageNow(
      withFullResources({ ...debuff, atk: debuff.atk * (1 + 0.6) }),
      knobs,
    );
    expect(playerDamageFullPill(debuff, knobs)).toBeCloseTo(expected);
  });

  it("applies pill ATK bonus when already active", () => {
    const active = player("active");
    const expected = playerDamageNow(
      withFullResources({ ...active, atk: active.atk * (1 + 0.6) }),
      knobs,
    );
    expect(playerDamageFullPill(active, knobs)).toBeCloseTo(expected);
  });

  it("uses full resources, not the snapshot mid-fight bars", () => {
    const midFight = { ...player("ready"), hp: 10, hunger: 0 };
    const full = { ...player("ready"), hp: 100, hunger: 100 };
    expect(playerDamageFullPill(midFight, knobs)).toBeCloseTo(
      playerDamageFullPill(full, knobs),
    );
  });
});
