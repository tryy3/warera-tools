export type WagePair = { gross: number; net: number };

export function netWageFromGross(grossWagePerPp: number, incomeTaxRate: number): number {
  return grossWagePerPp * (1 - incomeTaxRate);
}

export function maxGrossWagePerPp(profitPerPp: number): number {
  return profitPerPp;
}

export function wagePair(gross: number, incomeTaxRate: number): WagePair {
  return { gross, net: netWageFromGross(gross, incomeTaxRate) };
}
