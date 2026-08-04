export type WagePair = { gross: number; net: number };

export function netWageFromGross(grossWagePerPp: number, incomeTaxRate: number): number {
  return grossWagePerPp * (1 - incomeTaxRate);
}

/**
 * Owner break-even gross wage at 0% fidelity.
 * Wage is charged on base PP while output includes production bonus, so:
 * maxGross = profitPerPp × (1 + productionBonus).
 */
export function maxGrossWagePerPp(profitPerPp: number, productionBonus = 0): number {
  return profitPerPp * (1 + productionBonus);
}

export function wagePair(gross: number, incomeTaxRate: number): WagePair {
  return { gross, net: netWageFromGross(gross, incomeTaxRate) };
}
