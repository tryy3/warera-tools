import { describe, expect, it } from "vite-plus/test";
import type { FightPlayerInput } from "./types";
import { projectResources } from "./project";

const player: FightPlayerInput = {
  userId: "player",
  atk: 100,
  precision: 1,
  critChance: 0,
  critDamage: 2.66,
  armor: 0,
  dodge: 0,
  hp: 50,
  maxHp: 75,
  hunger: 20,
  maxHunger: 50,
  hpRegenPerHour: 15,
  hungerRegenPerHour: 20,
  pillStatus: "ready",
};

describe("projectResources", () => {
  it("projects regeneration by ticks and caps resources at their maximums", () => {
    expect(projectResources(player, 2)).toEqual({ hp: 75, hunger: 50 });
  });

  it("floors hunger to whole eats (fractional hunger cannot be spent)", () => {
    expect(
      projectResources(
        {
          ...player,
          hunger: 1.8,
          maxHunger: 6,
          hungerRegenPerHour: 0,
        },
        0,
      ),
    ).toEqual({ hp: 50, hunger: 1 });
  });
});
