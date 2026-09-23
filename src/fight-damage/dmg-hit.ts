import type { FightPlayerInput } from "./types";

export const HP_LOSS_DIMINISH_K = 40;
/** Base health spent per attempted hit before armor/dodge diminishing returns. */
export const BASE_HP_LOSS_PER_HIT = 10;

export function dmgPerHit(
  input: Pick<FightPlayerInput, "atk" | "precision" | "critChance" | "critDamage">,
): number {
  const accurateHitDamage =
    input.critChance * input.atk * (1 + input.critDamage) + (1 - input.critChance) * input.atk;
  const missedHitDamage = input.atk * 0.5;

  return input.precision * accurateHitDamage + (1 - input.precision) * missedHitDamage;
}

/**
 * Expected HP lost per attempted hit (Sanna / WarEra).
 * Armor and dodge each apply `K/(K+stat)` independently against a base cost of 10.
 */
export function hpLossPerHit(armor: number, dodge: number): number {
  const armorFactor = HP_LOSS_DIMINISH_K / (HP_LOSS_DIMINISH_K + armor);
  const dodgeFactor = HP_LOSS_DIMINISH_K / (HP_LOSS_DIMINISH_K + dodge);
  return BASE_HP_LOSS_PER_HIT * armorFactor * dodgeFactor;
}
