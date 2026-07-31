export type ProfitInput = {
  scrapPrice: number;
  scrapAmount: number;
  inclPrice: number;
  taxRate: number;
};

export type ProfitBreakdown = {
  dismantleValue: number;
  inclPrice: number;
  exclPrice: number;
  profit: number;
};

export function calculateProfit(input: ProfitInput): ProfitBreakdown {
  const dismantleValue = input.scrapPrice * input.scrapAmount;
  const exclPrice = input.inclPrice / (1 + input.taxRate);
  return {
    dismantleValue,
    inclPrice: input.inclPrice,
    exclPrice,
    profit: exclPrice - dismantleValue,
  };
}
