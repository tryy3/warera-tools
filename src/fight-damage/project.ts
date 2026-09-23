import type { FightPlayerInput } from "./types";

export function projectResources(
  input: FightPlayerInput,
  ticks: number,
): { hp: number; hunger: number } {
  const hp = Math.min(input.maxHp, input.hp + input.hpRegenPerHour * ticks);
  // Eating spends 1 whole hunger per food; fractional remainder is not usable.
  const hunger = Math.floor(
    Math.min(input.maxHunger, input.hunger + input.hungerRegenPerHour * ticks),
  );
  return { hp, hunger };
}
