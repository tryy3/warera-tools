import type { FightPlayerInput } from "./types";

export const HP_LOSS_DIMINISH_K = 40;
export const BASE_HP_LOSS_PER_HIT = 1;

export function dmgPerHit(
  input: Pick<FightPlayerInput, "atk" | "precision" | "critChance" | "critDamage">,
): number {
  const accurateHitDamage =
    input.critChance * input.atk * (1 + input.critDamage) + (1 - input.critChance) * input.atk;
  const missedHitDamage = input.atk * 0.5;

  return input.precision * accurateHitDamage + (1 - input.precision) * missedHitDamage;
}

export function hpLossPerHit(armor: number, dodge: number): number {
  return BASE_HP_LOSS_PER_HIT * (HP_LOSS_DIMINISH_K / (armor + dodge + HP_LOSS_DIMINISH_K));
}
