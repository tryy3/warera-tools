import { formatDisplayNumber } from "../lib/formatDisplayNumber";
import { Decimal, isFiniteMoney, parseMoney } from "../money/decimal";
import { getRecipe, listProducibleRecipes, type Recipe } from "./recipes";

export type MoneyPriceMap = Record<string, Decimal | number | string>;

/** Order-book prices: Buy = best bid, Sell = best ask (Market UI). */
export type BookPrices = {
  buy: MoneyPriceMap;
  sell: MoneyPriceMap;
};

type StrictBook = {
  buy: Record<string, Decimal>;
  sell: Record<string, Decimal>;
};

function toMoneyRecord(map: MoneyPriceMap): Record<string, Decimal> {
  const out: Record<string, Decimal> = {};
  for (const [key, value] of Object.entries(map)) {
    const parsed = parseMoney(value);
    if (isFiniteMoney(parsed)) out[key] = parsed;
  }
  return out;
}

type MoneyInput = Decimal | number | string;

export type ProfitPpBreakdown = {
  itemCode: string;
  /** @deprecated Prefer sellPrice; kept as output sell for older readers. */
  marketPrice: Decimal;
  /** Output item top buy (best bid), if known. */
  buyPrice: Decimal | null;
  /** Output item top sell (best ask) used as revenue. */
  sellPrice: Decimal;
  inputCost: Decimal;
  unitProfit: Decimal;
  consumedPp: number;
  profitPerPp: Decimal | null;
  missingInputs: string[];
  /** Human-readable formula using current numbers. */
  formula: string;
};

export function bookPricesFromMarket(market: MoneyPriceMap): BookPrices {
  const prices = toMoneyRecord(market);
  return { buy: prices, sell: prices };
}

function isBookPrices(prices: MoneyPriceMap | BookPrices): prices is BookPrices {
  return (
    prices != null &&
    typeof prices === "object" &&
    "buy" in prices &&
    "sell" in prices &&
    typeof (prices as BookPrices).buy === "object" &&
    typeof (prices as BookPrices).sell === "object"
  );
}

function asBook(prices: MoneyPriceMap | BookPrices): StrictBook {
  if (isBookPrices(prices)) {
    return {
      buy: toMoneyRecord(prices.buy),
      sell: toMoneyRecord(prices.sell),
    };
  }
  return {
    buy: toMoneyRecord(prices),
    sell: toMoneyRecord(prices),
  };
}

export function calculateProfitPerPp(
  itemCode: string,
  prices: MoneyPriceMap | BookPrices,
): ProfitPpBreakdown | null {
  const recipe = getRecipe(itemCode);
  if (!recipe) return null;
  return profitForRecipe(recipe, asBook(prices));
}

function formatInputs(recipe: Recipe, buy: Record<string, Decimal>): string {
  if (recipe.inputs.length === 0) return "0 G buy";
  return recipe.inputs
    .map((input) => {
      const p = buy[input.itemCode];
      const priceLabel = isFiniteMoney(p) ? `${formatDisplayNumber(p)} G` : "? G";
      return `${input.quantity} ${input.itemCode} × ${priceLabel}`;
    })
    .join(" + ");
}

/**
 * Listing / optimistic: revenue = sell(output), costs = buy(inputs).
 */
function profitForRecipe(recipe: Recipe, book: StrictBook): ProfitPpBreakdown {
  const sellPrice = book.sell[recipe.itemCode];
  const buyCandidate = book.buy[recipe.itemCode];
  const buyPrice = isFiniteMoney(buyCandidate) ? buyCandidate : null;
  const missingInputs: string[] = [];
  const inputsLabel = formatInputs(recipe, book.buy);
  const nan = new Decimal(Number.NaN);

  if (!isFiniteMoney(sellPrice)) {
    return {
      itemCode: recipe.itemCode,
      marketPrice: nan,
      buyPrice,
      sellPrice: nan,
      inputCost: nan,
      unitProfit: nan,
      consumedPp: recipe.consumedPp,
      profitPerPp: null,
      missingInputs: [recipe.itemCode, ...recipe.inputs.map((i) => i.itemCode)],
      formula: `(? G sell − [${inputsLabel}]) / ${recipe.consumedPp} PP`,
    };
  }

  let inputCost = new Decimal(0);
  for (const input of recipe.inputs) {
    const p = book.buy[input.itemCode];
    if (!isFiniteMoney(p)) {
      missingInputs.push(input.itemCode);
      continue;
    }
    inputCost = inputCost.plus(p.times(input.quantity));
  }

  if (missingInputs.length > 0) {
    return {
      itemCode: recipe.itemCode,
      marketPrice: sellPrice,
      buyPrice,
      sellPrice,
      inputCost,
      unitProfit: nan,
      consumedPp: recipe.consumedPp,
      profitPerPp: null,
      missingInputs,
      formula: `(${formatDisplayNumber(sellPrice)} G sell − [${inputsLabel}]) / ${recipe.consumedPp} PP`,
    };
  }

  const unitProfit = sellPrice.minus(inputCost);
  const profitPerPp = recipe.consumedPp > 0 ? unitProfit.div(recipe.consumedPp) : null;
  return {
    itemCode: recipe.itemCode,
    marketPrice: sellPrice,
    buyPrice,
    sellPrice,
    inputCost,
    unitProfit,
    consumedPp: recipe.consumedPp,
    profitPerPp,
    missingInputs,
    formula: `(${formatDisplayNumber(sellPrice)} G sell − ${formatDisplayNumber(inputCost)} G buy) / ${recipe.consumedPp} PP`,
  };
}

export function listMarketOpportunities(prices: MoneyPriceMap | BookPrices): ProfitPpBreakdown[] {
  const book = asBook(prices);
  return listProducibleRecipes()
    .map((r) => profitForRecipe(r, book))
    .filter((b) => b.profitPerPp != null)
    .toSorted((a, b) => {
      const ap = a.profitPerPp ?? new Decimal(0);
      const bp = b.profitPerPp ?? new Decimal(0);
      return bp.comparedTo(ap);
    });
}

export const OPPORTUNITY_REFERENCE_AE = 6;

export type OpportunityRegionHint = {
  regionId: string;
  regionName: string | null;
  bonus: number | null;
};

export type MarketOpportunity = ProfitPpBreakdown & {
  bestBonus: number | null;
  bestRegionId: string | null;
  bestRegionName: string | null;
  roughDailyValue: Decimal | null;
  referenceAeLevel: number;
};

export function enrichMarketOpportunities(
  opportunities: ProfitPpBreakdown[],
  regionsByItem: ReadonlyMap<string, OpportunityRegionHint>,
): MarketOpportunity[] {
  return opportunities.map((o) => {
    const region = regionsByItem.get(o.itemCode);
    const bonus = region?.bonus;
    const hasBonus = bonus != null && Number.isFinite(bonus);
    const hasPp = isFiniteMoney(o.profitPerPp);
    return {
      ...o,
      bestBonus: hasBonus ? bonus : null,
      bestRegionId: region?.regionId ?? null,
      bestRegionName: region?.regionName ?? null,
      roughDailyValue:
        hasBonus && hasPp
          ? explainAeDaily(OPPORTUNITY_REFERENCE_AE, bonus, o.profitPerPp!).dailyValue
          : null,
      referenceAeLevel: OPPORTUNITY_REFERENCE_AE,
    };
  });
}

export type AeDailyBreakdown = {
  aeLevel: number;
  /** Production bonus as fraction (0.505 = +50.5%). */
  bonus: number;
  profitPerPp: Decimal;
  hoursPerDay: number;
  ppPerHour: number;
  dailyPp: number;
  dailyValue: Decimal;
  formula: string;
};

/** AE idle daily gold value. `bonus` is a fraction (0.35 = +35%). */
export function aeDailyValue(aeLevel: number, bonus: number, profitPerPp: MoneyInput): Decimal {
  return explainAeDaily(aeLevel, bonus, profitPerPp).dailyValue;
}

export function explainAeDaily(
  aeLevel: number,
  bonus: number,
  profitPerPp: MoneyInput,
  hoursPerDay = 24,
): AeDailyBreakdown {
  const pp = parseMoney(profitPerPp)!;
  const ppPerHour = aeLevel * (1 + bonus);
  const dailyPp = ppPerHour * hoursPerDay;
  const dailyValue = pp.times(dailyPp);
  const bonusPct = bonus * 100;
  return {
    aeLevel,
    bonus,
    profitPerPp: pp,
    hoursPerDay,
    ppPerHour,
    dailyPp,
    dailyValue,
    formula: `(${aeLevel} AE × (1 + ${formatDisplayNumber(bonusPct, 4)}% Bonus) × ${hoursPerDay}h) × ${formatDisplayNumber(pp)} G/PP`,
  };
}

export function transferCostGold(
  concretePrice: MoneyInput,
  opts: { retask: boolean; relocate: boolean },
): { concreteUnits: number; gold: Decimal; formula: string } {
  const price = parseMoney(concretePrice)!;
  const concreteUnits = (opts.retask ? 5 : 0) + (opts.relocate ? 5 : 0);
  const parts: string[] = [];
  if (opts.retask) parts.push("5 Concrete retask");
  if (opts.relocate) parts.push("5 Concrete relocate");
  const gold = price.times(concreteUnits);
  return {
    concreteUnits,
    gold,
    formula:
      parts.length === 0
        ? "0 Concrete"
        : `(${parts.join(" + ")}) × ${formatDisplayNumber(price)} G Concrete`,
  };
}

export function paybackDays(transferGold: MoneyInput, dailyDelta: MoneyInput): number | null {
  const transfer = parseMoney(transferGold)!;
  const delta = parseMoney(dailyDelta)!;
  if (!delta.gt(0) || !transfer.gte(0)) return null;
  if (transfer.isZero()) return 0;
  return transfer.div(delta).toNumber();
}
