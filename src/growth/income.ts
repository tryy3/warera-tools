import { aeDailyValue } from "../economy/profit";

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

export function goldPerAePerDayFromProfit(profitPerPp: number, bonus: number): number {
  return aeDailyValue(1, bonus, profitPerPp);
}

export function dailyGoldFromFactories(
  factories: GrowthFactory[],
  side: GrowthSideIncome,
): number {
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
