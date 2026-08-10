import { describe, expect, it } from "vite-plus/test";
import { allocatePortfolio } from "./allocate";
import type { PortfolioCompanyInput } from "./types";

const book = {
  buy: { iron: 0.05, steel: 0.8 },
  sell: { iron: 0.06, steel: 1.0 },
};

function co(
  partial: Partial<PortfolioCompanyInput> & Pick<PortfolioCompanyInput, "companyId" | "itemCode">,
): PortfolioCompanyInput {
  return {
    unitsOut: 0,
    wageCostPerDay: 0,
    inputDemand: {},
    ...partial,
  };
}

describe("allocatePortfolio", () => {
  it("gives steel free internal iron and markets the shortfall", () => {
    const companies: PortfolioCompanyInput[] = [
      co({
        companyId: "iron-1",
        itemCode: "iron",
        unitsOut: 300,
        wageCostPerDay: 10,
        inputDemand: {},
      }),
      co({
        companyId: "steel-1",
        itemCode: "steel",
        unitsOut: 50, // 50 × 10 iron = 500 demand
        wageCostPerDay: 20,
        inputDemand: { iron: 500 },
      }),
    ];
    const r = allocatePortfolio(companies, book);
    const iron = r.byCompanyId["iron-1"]!;
    const steel = r.byCompanyId["steel-1"]!;

    expect(iron.transferredOut).toBeCloseTo(300);
    expect(iron.soldOut).toBeCloseTo(0);
    expect(iron.sellRevenueActual).toBeCloseTo(0);
    expect(iron.actualProfit).toBeCloseTo(-10); // wages only

    expect(steel.marketBoughtByInput.iron).toBeCloseTo(200);
    expect(steel.marketBuyCash).toBeCloseTo(200 * 0.05);
    expect(steel.effectiveInputCostPerUnit).toBeCloseTo((200 * 0.05) / 50);
    expect(steel.sellRevenueActual).toBeCloseTo(50 * 1.0);
    expect(steel.actualProfit).toBeCloseTo(50 * 1.0 - 20 - 200 * 0.05);

    expect(steel.markToMarketProfit).toBeCloseTo(50 * 1.0 - 20 - 500 * 0.05);
    expect(iron.markToMarketProfit).toBeCloseTo(300 * 0.06 - 10);
  });

  it("waterfalls two iron companies into one steel in card order", () => {
    const companies: PortfolioCompanyInput[] = [
      co({
        companyId: "iron-a",
        itemCode: "iron",
        unitsOut: 100,
        wageCostPerDay: 1,
        inputDemand: {},
      }),
      co({
        companyId: "iron-b",
        itemCode: "iron",
        unitsOut: 100,
        wageCostPerDay: 1,
        inputDemand: {},
      }),
      co({
        companyId: "steel-1",
        itemCode: "steel",
        unitsOut: 25, // needs 250 iron
        wageCostPerDay: 5,
        inputDemand: { iron: 250 },
      }),
    ];
    const r = allocatePortfolio(companies, book);
    expect(r.byCompanyId["iron-a"]!.transferredOut).toBeCloseTo(100);
    expect(r.byCompanyId["iron-a"]!.soldOut).toBeCloseTo(0);
    expect(r.byCompanyId["iron-b"]!.transferredOut).toBeCloseTo(100);
    expect(r.byCompanyId["iron-b"]!.soldOut).toBeCloseTo(0);
    expect(r.byCompanyId["steel-1"]!.marketBoughtByInput.iron).toBeCloseTo(50);
  });

  it("sells surplus iron at sell price", () => {
    const companies: PortfolioCompanyInput[] = [
      co({
        companyId: "iron-1",
        itemCode: "iron",
        unitsOut: 400,
        wageCostPerDay: 10,
        inputDemand: {},
      }),
      co({
        companyId: "steel-1",
        itemCode: "steel",
        unitsOut: 10, // needs 100 iron
        wageCostPerDay: 5,
        inputDemand: { iron: 100 },
      }),
    ];
    const r = allocatePortfolio(companies, book);
    expect(r.byCompanyId["iron-1"]!.transferredOut).toBeCloseTo(100);
    expect(r.byCompanyId["iron-1"]!.soldOut).toBeCloseTo(300);
    expect(r.byCompanyId["iron-1"]!.sellRevenueActual).toBeCloseTo(300 * 0.06);
    expect(r.byCompanyId["iron-1"]!.actualProfit).toBeCloseTo(300 * 0.06 - 10);
  });

  it("matches mark-to-market when there are no consumers", () => {
    const companies: PortfolioCompanyInput[] = [
      co({
        companyId: "iron-1",
        itemCode: "iron",
        unitsOut: 100,
        wageCostPerDay: 4,
        inputDemand: {},
      }),
    ];
    const r = allocatePortfolio(companies, book);
    const iron = r.byCompanyId["iron-1"]!;
    expect(iron.soldOut).toBeCloseTo(100);
    expect(iron.actualProfit).toBeCloseTo(iron.markToMarketProfit);
  });

  it("uses session buy override for shortfall cash", () => {
    const companies: PortfolioCompanyInput[] = [
      co({
        companyId: "iron-1",
        itemCode: "iron",
        unitsOut: 0,
        wageCostPerDay: 0,
        inputDemand: {},
      }),
      co({
        companyId: "steel-1",
        itemCode: "steel",
        unitsOut: 10,
        wageCostPerDay: 0,
        inputDemand: { iron: 100 },
      }),
    ];
    const overridden = { buy: { ...book.buy, iron: 0.09 }, sell: book.sell };
    const r = allocatePortfolio(companies, overridden);
    expect(r.byCompanyId["steel-1"]!.marketBuyCash).toBeCloseTo(100 * 0.09);
  });
});
