import {
  allocatePortfolio,
  enrichProducerRows,
  type CompanyAllocation,
  type EnrichedProducerRow,
} from "../../../../economy/portfolio";
import type { BookPrices } from "../../../../economy/profit";
import { getRecipe } from "../../../../economy/recipes";
import {
  companyDay,
  type CompanyDayResult,
  wagePair,
  type WagePair,
} from "../../../../economy/workers";
import { effectiveProfitForItem } from "../sessionPrices/effective";
import type { CompanyAdvisorRow } from "../types";
import type { CompanyOverrides, CompanySimState, SimWorker } from "./types";

export type DerivedCompanyCard = {
  companyId: string;
  dirty: boolean;
  workersStatus: "ok" | "unavailable";
  incomeTaxRate: number;
  incomeTaxAssumed: boolean;
  activeWorkerCount: number;
  /** Effective Profit/PP after session buy/sell overrides. */
  profitPerPp: number;
  day: CompanyDayResult;
  offerWage: WagePair | null;
  maxWage: WagePair;
  allocation: CompanyAllocation | null;
  producerRows: EnrichedProducerRow[];
  actualProfit: number;
  markToMarketProfit: number;
};

type OwnerDefaults = {
  entrepreneurshipLevel: number;
  productionSkillLevel: number;
};

const EMPTY_BOOK: BookPrices = { buy: {}, sell: {} };

function assignedWorkers(state: CompanySimState, companyId: string): SimWorker[] {
  return state.workers.filter((w) => w.assignment === companyId);
}

/** Workers that contribute to company day math (error rows need a manual edit first). */
export function workersIncludedInTotals(workers: SimWorker[]): SimWorker[] {
  return workers.filter((w) => !w.enrichmentError || w.dirty);
}

function isDirty(overrides: CompanyOverrides | undefined, assigned: SimWorker[]): boolean {
  if (overrides != null && Object.keys(overrides).length > 0) return true;
  return assigned.some((w) => w.dirty || w.kind === "simulated");
}

function resolveProfitPerPp(row: CompanyAdvisorRow): number {
  return row.currentProfitPerPp ?? row.profitBreakdown?.profitPerPp ?? 0;
}

function resolveInputCostPerUnit(row: CompanyAdvisorRow): number {
  const breakdown = row.profitBreakdown;
  if (breakdown == null) return 0;
  return Number.isFinite(breakdown.inputCost) ? breakdown.inputCost : 0;
}

function unitsFromPp(itemCode: string | null, pp: number): number {
  if (itemCode == null) return 0;
  const recipe = getRecipe(itemCode);
  if (recipe == null || recipe.consumedPp <= 0) return 0;
  return pp / recipe.consumedPp;
}

function inputDemandFor(itemCode: string | null, unitsOut: number): Record<string, number> {
  if (itemCode == null || !(unitsOut > 0)) return {};
  const recipe = getRecipe(itemCode);
  if (recipe == null) return {};
  const demand: Record<string, number> = {};
  for (const input of recipe.inputs) {
    demand[input.itemCode] = (demand[input.itemCode] ?? 0) + unitsOut * input.quantity;
  }
  return demand;
}

function finiteSellPrice(book: BookPrices, itemCode: string | null): number {
  if (itemCode == null) return 0;
  const price = book.sell[itemCode];
  return price !== undefined && Number.isFinite(price) ? price : 0;
}

export function deriveCompanyCard(
  row: CompanyAdvisorRow,
  state: CompanySimState,
  ownerDefaults: OwnerDefaults,
  book?: BookPrices,
): DerivedCompanyCard {
  const companyId = row.company.id;
  const overrides = state.overrides[companyId];
  const assigned = assignedWorkers(state, companyId);
  const included = workersIncludedInTotals(assigned);

  const aeLevel = overrides?.aeLevel ?? row.company.aeLevel;
  const productionBonus = overrides?.productionBonus ?? row.company.productionBonus ?? 0;
  const entrepreneurshipLevel =
    overrides?.entrepreneurshipLevel ?? ownerDefaults.entrepreneurshipLevel;
  const productionSkillLevel =
    overrides?.productionSkillLevel ?? ownerDefaults.productionSkillLevel;
  const includeSelfWork = overrides?.includeSelfWork ?? false;
  const offerWagePerPp = overrides?.offerWagePerPp ?? row.offerWagePerPp;
  const fromBook = book ? effectiveProfitForItem(row.company.itemCode, book) : null;
  const profitPerPp = fromBook?.profitPerPp ?? resolveProfitPerPp(row);
  const inputCostPerUnit = fromBook?.inputCost ?? resolveInputCostPerUnit(row);
  const incomeTaxRate = row.incomeTaxRate;

  const day = companyDay({
    aeLevel,
    productionBonus,
    profitPerPp: profitPerPp ?? 0,
    itemCode: row.company.itemCode,
    inputCostPerUnit,
    entrepreneurshipLevel,
    productionSkillLevel,
    includeSelfWork,
    workers: included.map((w) => ({
      id: w.id,
      energyLevel: w.energyLevel,
      productionLevel: w.productionLevel,
      fidelityPct: w.fidelityPct,
      grossWagePerPp: w.wagePerPp,
    })),
  });

  return {
    companyId,
    dirty: isDirty(overrides, assigned),
    workersStatus: row.workersStatus,
    incomeTaxRate,
    incomeTaxAssumed: row.incomeTaxAssumed,
    activeWorkerCount: included.length,
    profitPerPp: profitPerPp ?? 0,
    day,
    offerWage: offerWagePerPp != null ? wagePair(offerWagePerPp, incomeTaxRate) : null,
    maxWage: wagePair(day.maxGrossWagePerPp, incomeTaxRate),
    allocation: null,
    producerRows: [],
    actualProfit: 0,
    markToMarketProfit: 0,
  };
}

/** Attach portfolio allocation + enriched producer rows (companies array order). */
export function applyPortfolioAllocation(
  cards: DerivedCompanyCard[],
  companies: CompanyAdvisorRow[],
  book?: BookPrices,
): {
  cards: DerivedCompanyCard[];
  portfolioActual: number;
  portfolioMarkToMarket: number;
} {
  const prices = book ?? EMPTY_BOOK;
  const inputs = cards.map((card, i) => {
    const row = companies[i]!;
    const itemCode = row.company.itemCode;
    const unitsOut = card.day.unitsProduced ?? 0;
    return {
      companyId: card.companyId,
      itemCode,
      unitsOut,
      wageCostPerDay: card.day.workerWageCostPerDay,
      inputDemand: inputDemandFor(itemCode, unitsOut),
    };
  });

  const allocation = allocatePortfolio(inputs, prices);

  const nextCards = cards.map((card, i) => {
    const row = companies[i]!;
    const itemCode = row.company.itemCode;
    const unitsOut = card.day.unitsProduced ?? 0;
    const companyAlloc = allocation.byCompanyId[card.companyId] ?? null;
    const sellPrice = finiteSellPrice(prices, itemCode);

    const producerRows =
      companyAlloc == null
        ? []
        : enrichProducerRows({
            unitsOut,
            sellPrice,
            allocation: companyAlloc,
            ae: {
              id: "ae",
              rowUnits: unitsFromPp(itemCode, card.day.aeDailyPp),
              wageCost: 0,
            },
            workers: card.day.workers.map((w) => ({
              id: w.id,
              rowUnits: unitsFromPp(itemCode, w.current.effectivePpPerDay),
              wageCost: w.current.ownerCostPerDay,
            })),
          });

    return {
      ...card,
      allocation: companyAlloc,
      producerRows,
      actualProfit: companyAlloc?.actualProfit ?? 0,
      markToMarketProfit: companyAlloc?.markToMarketProfit ?? 0,
    };
  });

  return {
    cards: nextCards,
    portfolioActual: allocation.portfolio.actualProfit,
    portfolioMarkToMarket: allocation.portfolio.markToMarketProfit,
  };
}

export function derivePortfolioCards(
  companies: CompanyAdvisorRow[],
  state: CompanySimState,
  ownerDefaults: OwnerDefaults,
  book?: BookPrices,
): {
  cards: DerivedCompanyCard[];
  portfolioActual: number;
  portfolioMarkToMarket: number;
} {
  const cards = companies.map((row) => deriveCompanyCard(row, state, ownerDefaults, book));
  return applyPortfolioAllocation(cards, companies, book);
}

export function derivePortfolioNet(cards: DerivedCompanyCard[]): number {
  let total = 0;
  for (const card of cards) {
    total += card.actualProfit;
  }
  return total;
}
