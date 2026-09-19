import { aeDailyValue } from "../economy/profit";
import { Decimal } from "../money/decimal";

export type GrowthFactory = {
  id: string;
  aeLevel: number;
  goldPerAePerDay: number;
};

export type GrowthSideIncome = {
  workGPerDay: number;
  selfWorkGPerDay: number;
  extraGoldPerDay: number;
};

export function sideIncomeTotal(side: GrowthSideIncome): number {
  return side.workGPerDay + side.selfWorkGPerDay + side.extraGoldPerDay;
}

export function goldPerAePerDayFromProfit(profitPerPp: number | Decimal, bonus: number): number {
  const pp = profitPerPp instanceof Decimal ? profitPerPp : new Decimal(profitPerPp);
  return aeDailyValue(1, bonus, pp).toNumber();
}

export function dailyGoldFromFactories(factories: GrowthFactory[], side: GrowthSideIncome): number {
  let sum = sideIncomeTotal(side);
  for (const f of factories) {
    sum += f.aeLevel * f.goldPerAePerDay;
  }
  return sum;
}

export function hourlyGoldFromFactories(
  factories: GrowthFactory[],
  side: GrowthSideIncome,
): number {
  return dailyGoldFromFactories(factories, side) / 24;
}
