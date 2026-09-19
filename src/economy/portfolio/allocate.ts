import { isFiniteMoney, parseMoney, type Decimal } from "../../money/decimal";
import type { BookPrices } from "../profit";
import type { CompanyAllocation, PortfolioAllocation, PortfolioCompanyInput } from "./types";

function bookPrice(bookSide: BookPrices["buy"], key: string): Decimal | null {
  const parsed = parseMoney(bookSide[key]);
  return isFiniteMoney(parsed) ? parsed : null;
}

function sumProfits(values: number[]): number {
  if (values.some((v) => Number.isNaN(v))) return NaN;
  return values.reduce((sum, v) => sum + v, 0);
}

type CompanyState = {
  remainingOut: number;
  transferredOut: number;
  soldOut: number;
  marketBoughtByInput: Record<string, number>;
  wageCostPerDay: number;
  itemCode: string | null;
  unitsOut: number;
  inputDemand: Record<string, number>;
};

export function allocatePortfolio(
  companies: PortfolioCompanyInput[],
  book: BookPrices,
): PortfolioAllocation {
  const stateById = new Map<string, CompanyState>();

  for (const company of companies) {
    const remainingOut =
      company.itemCode == null || !Number.isFinite(company.unitsOut) ? 0 : company.unitsOut;

    stateById.set(company.companyId, {
      remainingOut,
      transferredOut: 0,
      soldOut: 0,
      marketBoughtByInput: {},
      wageCostPerDay: company.wageCostPerDay,
      itemCode: company.itemCode,
      unitsOut: company.unitsOut,
      inputDemand: company.inputDemand,
    });
  }

  const itemCodes = new Set<string>();
  for (const company of companies) {
    if (company.itemCode != null) itemCodes.add(company.itemCode);
    for (const input of Object.keys(company.inputDemand)) {
      itemCodes.add(input);
    }
  }

  for (const item of [...itemCodes].sort()) {
    const supply = companies
      .filter((company) => company.itemCode === item)
      .map((company) => ({
        companyId: company.companyId,
        remaining: stateById.get(company.companyId)!.remainingOut,
      }));

    for (const company of companies) {
      let need = company.inputDemand[item] ?? 0;
      if (need <= 0) continue;

      for (const source of supply) {
        if (need <= 0) break;
        const take = Math.min(need, source.remaining);
        if (take <= 0) continue;

        need -= take;
        source.remaining -= take;

        const producer = stateById.get(source.companyId)!;
        producer.transferredOut += take;
        producer.remainingOut -= take;
      }

      if (need > 0) {
        const consumer = stateById.get(company.companyId)!;
        consumer.marketBoughtByInput[item] = (consumer.marketBoughtByInput[item] ?? 0) + need;
      }
    }

    for (const company of companies) {
      if (company.itemCode !== item) continue;
      const producer = stateById.get(company.companyId)!;
      producer.soldOut = producer.remainingOut;
    }
  }

  const byCompanyId: Record<string, CompanyAllocation> = {};

  for (const company of companies) {
    const state = stateById.get(company.companyId)!;

    let marketBuyCash = 0;
    let marketBuyCashNaN = false;
    for (const [input, units] of Object.entries(state.marketBoughtByInput)) {
      if (units <= 0) continue;
      const buyPrice = bookPrice(book.buy, input);
      if (buyPrice == null) {
        marketBuyCashNaN = true;
      } else {
        marketBuyCash += units * buyPrice.toNumber();
      }
    }
    if (marketBuyCashNaN) marketBuyCash = NaN;

    let sellRevenueActual = 0;
    if (state.soldOut > 0) {
      const sellPrice = state.itemCode != null ? bookPrice(book.sell, state.itemCode) : null;
      if (sellPrice == null) {
        sellRevenueActual = NaN;
      } else {
        sellRevenueActual = state.soldOut * sellPrice.toNumber();
      }
    }

    const effectiveInputCostPerUnit = state.unitsOut > 0 ? marketBuyCash / state.unitsOut : 0;

    const actualProfit =
      Number.isNaN(sellRevenueActual) || Number.isNaN(marketBuyCash)
        ? NaN
        : sellRevenueActual - state.wageCostPerDay - marketBuyCash;

    let markToMarketProfit = 0;
    let markToMarketNaN = false;

    if (state.unitsOut > 0 && state.itemCode != null) {
      const sellPrice = bookPrice(book.sell, state.itemCode);
      if (sellPrice == null) {
        markToMarketNaN = true;
      } else {
        markToMarketProfit += state.unitsOut * sellPrice.toNumber();
      }
    }

    for (const [input, demand] of Object.entries(state.inputDemand)) {
      if (demand <= 0) continue;
      const buyPrice = bookPrice(book.buy, input);
      if (buyPrice == null) {
        markToMarketNaN = true;
      } else {
        markToMarketProfit -= demand * buyPrice.toNumber();
      }
    }

    if (!markToMarketNaN) {
      markToMarketProfit -= state.wageCostPerDay;
    } else {
      markToMarketProfit = NaN;
    }

    byCompanyId[company.companyId] = {
      transferredOut: state.transferredOut,
      soldOut: state.soldOut,
      marketBoughtByInput: { ...state.marketBoughtByInput },
      marketBuyCash,
      sellRevenueActual,
      effectiveInputCostPerUnit,
      wageCostPerDay: state.wageCostPerDay,
      actualProfit,
      markToMarketProfit,
    };
  }

  const companyAllocations = companies.map((company) => byCompanyId[company.companyId]!);

  return {
    byCompanyId,
    portfolio: {
      actualProfit: sumProfits(companyAllocations.map((a) => a.actualProfit)),
      markToMarketProfit: sumProfits(companyAllocations.map((a) => a.markToMarketProfit)),
    },
  };
}
