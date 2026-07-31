import { getRecipe, listProducibleRecipes, type Recipe } from "./recipes";

export type ProfitPpBreakdown = {
  itemCode: string;
  marketPrice: number;
  inputCost: number;
  unitProfit: number;
  consumedPp: number;
  profitPerPp: number | null;
  missingInputs: string[];
  /** Human-readable formula using current numbers. */
  formula: string;
};

export function calculateProfitPerPp(
  itemCode: string,
  prices: Record<string, number>,
): ProfitPpBreakdown | null {
  const recipe = getRecipe(itemCode);
  if (!recipe) return null;
  return profitForRecipe(recipe, prices);
}

function formatInputs(recipe: Recipe, prices: Record<string, number>): string {
  if (recipe.inputs.length === 0) return "0 G raw";
  return recipe.inputs
    .map((input) => {
      const p = prices[input.itemCode];
      const priceLabel = p != null && Number.isFinite(p) ? `${p} G` : "? G";
      return `${input.quantity} ${input.itemCode} × ${priceLabel}`;
    })
    .join(" + ");
}

function profitForRecipe(recipe: Recipe, prices: Record<string, number>): ProfitPpBreakdown {
  const marketPrice = prices[recipe.itemCode];
  const missingInputs: string[] = [];
  const inputsLabel = formatInputs(recipe, prices);

  if (marketPrice == null || !Number.isFinite(marketPrice)) {
    return {
      itemCode: recipe.itemCode,
      marketPrice: Number.NaN,
      inputCost: Number.NaN,
      unitProfit: Number.NaN,
      consumedPp: recipe.consumedPp,
      profitPerPp: null,
      missingInputs: [recipe.itemCode, ...recipe.inputs.map((i) => i.itemCode)],
      formula: `(? G − [${inputsLabel}]) / ${recipe.consumedPp} PP`,
    };
  }

  let inputCost = 0;
  for (const input of recipe.inputs) {
    const p = prices[input.itemCode];
    if (p == null || !Number.isFinite(p)) {
      missingInputs.push(input.itemCode);
      continue;
    }
    inputCost += input.quantity * p;
  }

  if (missingInputs.length > 0) {
    return {
      itemCode: recipe.itemCode,
      marketPrice,
      inputCost,
      unitProfit: Number.NaN,
      consumedPp: recipe.consumedPp,
      profitPerPp: null,
      missingInputs,
      formula: `(${marketPrice} G − [${inputsLabel}]) / ${recipe.consumedPp} PP`,
    };
  }

  const unitProfit = marketPrice - inputCost;
  const profitPerPp = recipe.consumedPp > 0 ? unitProfit / recipe.consumedPp : null;
  return {
    itemCode: recipe.itemCode,
    marketPrice,
    inputCost,
    unitProfit,
    consumedPp: recipe.consumedPp,
    profitPerPp,
    missingInputs,
    formula: `(${marketPrice} G − ${inputCost} G raw) / ${recipe.consumedPp} PP`,
  };
}

export function listMarketOpportunities(prices: Record<string, number>): ProfitPpBreakdown[] {
  return listProducibleRecipes()
    .map((r) => profitForRecipe(r, prices))
    .filter((b) => b.profitPerPp != null)
    .toSorted((a, b) => (b.profitPerPp ?? 0) - (a.profitPerPp ?? 0));
}

export type AeDailyBreakdown = {
  aeLevel: number;
  /** Production bonus as fraction (0.505 = +50.5%). */
  bonus: number;
  profitPerPp: number;
  hoursPerDay: number;
  ppPerHour: number;
  dailyPp: number;
  dailyValue: number;
  formula: string;
};

/** AE idle daily gold value. `bonus` is a fraction (0.35 = +35%). */
export function aeDailyValue(aeLevel: number, bonus: number, profitPerPp: number): number {
  return explainAeDaily(aeLevel, bonus, profitPerPp).dailyValue;
}

export function explainAeDaily(
  aeLevel: number,
  bonus: number,
  profitPerPp: number,
  hoursPerDay = 24,
): AeDailyBreakdown {
  const ppPerHour = aeLevel * (1 + bonus);
  const dailyPp = ppPerHour * hoursPerDay;
  const dailyValue = dailyPp * profitPerPp;
  const bonusPct = bonus * 100;
  return {
    aeLevel,
    bonus,
    profitPerPp,
    hoursPerDay,
    ppPerHour,
    dailyPp,
    dailyValue,
    formula: `(${aeLevel} AE × (1 + ${bonusPct}% Bonus) × ${hoursPerDay}h) × ${profitPerPp} G/PP`,
  };
}

export function transferCostGold(
  concretePrice: number,
  opts: { retask: boolean; relocate: boolean },
): { concreteUnits: number; gold: number; formula: string } {
  const concreteUnits = (opts.retask ? 5 : 0) + (opts.relocate ? 5 : 0);
  const parts: string[] = [];
  if (opts.retask) parts.push("5 Concrete retask");
  if (opts.relocate) parts.push("5 Concrete relocate");
  const gold = concreteUnits * concretePrice;
  return {
    concreteUnits,
    gold,
    formula:
      parts.length === 0 ? "0 Concrete" : `(${parts.join(" + ")}) × ${concretePrice} G Concrete`,
  };
}

export function paybackDays(transferGold: number, dailyDelta: number): number | null {
  if (!(dailyDelta > 0) || !(transferGold >= 0)) return null;
  if (transferGold === 0) return 0;
  return transferGold / dailyDelta;
}
