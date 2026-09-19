import { calculateProfit, scrapAmountForTier, type GearTierId } from "../calculator";
import { parseMoney, type Decimal } from "../money/decimal";

export const ATTRACTIVE_MARGIN = 0.05;

export type RecommendListing = {
  scrapFloor: Decimal;
  breakEvenIncl: Decimal;
  attractiveIncl: Decimal;
};

export function recommendListing(input: {
  tier: GearTierId;
  scrapPrice: Decimal | number;
  taxRate: number;
}): RecommendListing {
  const scrapPrice = parseMoney(input.scrapPrice)!;
  const scrapAmount = scrapAmountForTier(input.tier);
  const scrapFloor = scrapPrice.times(scrapAmount);
  // break-even: excl == scrapFloor ⇒ incl = scrapFloor * (1 + tax)
  const breakEvenIncl = scrapFloor.times(1 + input.taxRate);
  // sanity: calculateProfit at break-even should be ~0
  void calculateProfit({
    scrapPrice: scrapPrice.toNumber(),
    scrapAmount,
    inclPrice: breakEvenIncl.toNumber(),
    taxRate: input.taxRate,
  });
  return {
    scrapFloor,
    breakEvenIncl,
    attractiveIncl: breakEvenIncl.times(1 + ATTRACTIVE_MARGIN),
  };
}
