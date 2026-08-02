import { aeDailyValue } from "../economy/profit";

export type GrowthFactory = {
  id: string;
  aeLevel: number;
  goldPerAePerDay: number;
};

export function goldPerAePerDayFromProfit(profitPerPp: number, bonus: number): number {
  return aeDailyValue(1, bonus, profitPerPp);
}

export function dailyGoldFromFactories(
  factories: GrowthFactory[],
  extraGoldPerDay: number,
): number {
  let sum = extraGoldPerDay;
  for (const f of factories) {
    sum += f.aeLevel * f.goldPerAePerDay;
  }
  return sum;
}

export function hourlyGoldFromFactories(
  factories: GrowthFactory[],
  extraGoldPerDay: number,
): number {
  return dailyGoldFromFactories(factories, extraGoldPerDay) / 24;
}
