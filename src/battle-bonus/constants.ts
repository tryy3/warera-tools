export const ORDER_BONUS = { low: 0.05, medium: 0.1, high: 0.15 } as const;
export const PATRIOTIC_BONUS = 0.2;
export const HQ_BONUS_BY_LEVEL = [0, 0.05, 0.1, 0.15, 0.2] as const;
export const FORT_BONUS_PER_LEVEL = 0.05;
export const FORT_BONUS_MAX = 0.25;
export const SUPPLY_LINE_PENALTY = -0.25;
export const RESISTANCE_MAX = 0.3;
export const RAMP_PER_DAY = 0.01;
export const RAMP_MAX = 0.1;

/** v0.25 alliance curve: full +10% at share ≤ 15%; −0.5pp per share-pp over 15%; 0 at ≥ 35%. */
export function allianceBonusFromWorldShare(share: number): number {
  if (share <= 0.15) return 0.1;
  if (share >= 0.35) return 0;
  return 0.1 - (share - 0.15) * 0.5;
}
