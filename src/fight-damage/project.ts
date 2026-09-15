import type { FightPlayerInput } from "./types";

export function projectResources(
  input: FightPlayerInput,
  ticks: number,
): { hp: number; hunger: number } {
  return {
    hp: Math.min(input.maxHp, input.hp + input.hpRegenPerHour * ticks),
    hunger: Math.min(input.maxHunger, input.hunger + input.hungerRegenPerHour * ticks),
  };
}
