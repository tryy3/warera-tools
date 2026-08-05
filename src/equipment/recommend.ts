import { calculateProfit, scrapAmountForTier, type GearTierId } from "../calculator";

export const ATTRACTIVE_MARGIN = 0.05;

export type RecommendListing = {
  scrapFloor: number;
  breakEvenIncl: number;
  attractiveIncl: number;
};

export function recommendListing(input: {
  tier: GearTierId;
  scrapPrice: number;
  taxRate: number;
}): RecommendListing {
  const scrapAmount = scrapAmountForTier(input.tier);
  const scrapFloor = input.scrapPrice * scrapAmount;
  // break-even: excl == scrapFloor ⇒ incl = scrapFloor * (1 + tax)
  const breakEvenIncl = scrapFloor * (1 + input.taxRate);
  // sanity: calculateProfit at break-even should be ~0
  void calculateProfit({
    scrapPrice: input.scrapPrice,
    scrapAmount,
    inclPrice: breakEvenIncl,
    taxRate: input.taxRate,
  });
  return {
    scrapFloor,
    breakEvenIncl,
    attractiveIncl: breakEvenIncl * (1 + ATTRACTIVE_MARGIN),
  };
}
