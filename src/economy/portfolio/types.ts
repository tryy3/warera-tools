export type PortfolioCompanyInput = {
  companyId: string;
  itemCode: string | null;
  unitsOut: number;
  wageCostPerDay: number;
  /** Gross recipe demand: input itemCode → units needed per day */
  inputDemand: Record<string, number>;
};

export type CompanyAllocation = {
  transferredOut: number;
  soldOut: number;
  marketBoughtByInput: Record<string, number>;
  marketBuyCash: number;
  sellRevenueActual: number;
  effectiveInputCostPerUnit: number;
  wageCostPerDay: number;
  actualProfit: number;
  markToMarketProfit: number;
};

export type PortfolioAllocation = {
  byCompanyId: Record<string, CompanyAllocation>;
  portfolio: { actualProfit: number; markToMarketProfit: number };
};
