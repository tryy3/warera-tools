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
    // hp=70, hunger=20 → pool 70+20*0.15*100=370; hpLoss=10; hits=37; dmg=100; ×1.1
    expect(playerDamageNow(player("ready"), knobs)).toBeCloseTo(4070);
  });

  it("only counts whole hunger toward food (1.8 → 1 eat)", () => {
    const input = {
      ...player("active"),
      hp: 100,
      maxHp: 100,
      hunger: 1.8,
      maxHunger: 6,
      hpRegenPerHour: 0,
      hungerRegenPerHour: 0,
      armor: 0,
      dodge: 0,
    };
    const steak: FightKnobs = {
      foodId: "steak",
      foodBonus: 0.15,
      battleBonus: 0,
      ticks: 0,
    };
    // pool = 100 + 1*0.15*100 = 115; hpLoss=10; hits=11; dmg=100
    expect(playerDamageNow(input, steak)).toBe(1100);
  });

  it("matches Sanna Now damage for tryy3-like stats with steak and no battle bonus", () => {
    const tryy3Like: FightPlayerInput = {
      userId: "tryy3",
      atk: 781,
      precision: 1,
      critChance: 0.53,
      critDamage: 2.39,
      armor: 76,
      dodge: 45,
      hp: 49,
      maxHp: 150,
      hunger: 1,
      maxHunger: 8,
      hpRegenPerHour: 0,
      hungerRegenPerHour: 0,
      pillStatus: "active",
    };
    const steak: FightKnobs = {
      foodId: "steak",
      foodBonus: 0.15,
      battleBonus: 0,
      ticks: 0,
    };
    // dmg/hit≈1770.3, pool=49+22.5=71.5, hpPerHit≈1.623, hits=44 → ≈77893
    expect(playerDamageNow(tryy3Like, steak)).toBeCloseTo(77892.879, 1);
  });

  it("matches Sanna Now damage for a pilled fighter fixture", () => {
    const fjelleLike: FightPlayerInput = {
      userId: "fjelle",
      atk: 865,
      precision: 1,
      critChance: 0.59,
      critDamage: 2.62,
      armor: 77,
      dodge: 42,
      hp: 131,
      maxHp: 160,
      hunger: 4,
      maxHunger: 6,
      hpRegenPerHour: 0,
      hungerRegenPerHour: 0,
      pillStatus: "active",
    };
    const steak: FightKnobs = {
      foodId: "steak",
      foodBonus: 0.15,
      battleBonus: 0,
      ticks: 0,
    };
    // pool=131+4*0.15*160=227; hpPerHit≈1.6677 → 136 hits (matches Sanna row)
    expect(playerDamageNow(fjelleLike, steak)).toBeCloseTo(299487.912, 1);
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
    expect(playerDamageFullPill(midFight, knobs)).toBeCloseTo(playerDamageFullPill(full, knobs));
  });
});
