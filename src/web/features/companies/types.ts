export type Opportunity = {
  itemCode: string;
  /** Wire money string (from Decimal JSON). */
  marketPrice: string;
  buyPrice: string | null;
  sellPrice: string;
  inputCost: string;
  unitProfit: string;
  consumedPp: number;
  profitPerPp: string | null;
  formula: string;
  bestBonus: number | null;
  bestRegionId: string | null;
  bestRegionName: string | null;
  roughDailyValue: string | null;
  referenceAeLevel: number;
};

export type AeDailyBreakdown = {
  aeLevel: number;
  bonus: number;
  profitPerPp: string;
  hoursPerDay: number;
  ppPerHour: number;
  dailyPp: number;
  dailyValue: string;
  formula: string;
};

export type ProfitPpBreakdown = {
  itemCode: string;
  marketPrice: string;
  buyPrice: string | null;
  sellPrice: string;
  inputCost: string;
  unitProfit: string;
  consumedPp: number;
  profitPerPp: string | null;
  missingInputs: string[];
  formula: string;
};

export type ProductionBonusDetails = {
  total: number;
  strategicBonus: number;
  depositBonus: number;
  ethicSpecializationBonus: number;
  ethicDepositBonus: number;
  formula: string;
};

export type SwitchRecommendation = {
  itemCode: string;
  bestRegionId: string | null;
  bestRegionName: string | null;
  bestRegionCountryCode: string | null;
  bestBonus: number;
  profitPerPp: string;
  dailyValue: string;
  dailyDelta: string;
  retask: boolean;
  relocate: boolean;
  transferConcrete: number;
  transferGold: string;
  paybackDays: number | null;
  profitFormula: string;
  aeFormula: string;
  transferFormula: string;
  paybackFormula: string | null;
};

export type AdvisorWorker = {
  userId: string;
  username: string | null;
  wagePerPp: number | null;
  energyLevel: number | null;
  productionLevel: number | null;
  fidelityPct: number | null;
  enrichmentError: boolean;
};

export type CompanyAdvisorRow = {
  company: {
    id: string;
    name: string;
    itemCode: string | null;
    regionId: string | null;
    regionName: string | null;
    regionCountryCode: string | null;
    aeLevel: number;
    productionBonus: number | null;
  };
  bonusDetails: ProductionBonusDetails | null;
  profitBreakdown: ProfitPpBreakdown | null;
  aeBreakdown: AeDailyBreakdown | null;
  currentProfitPerPp: string | null;
  currentDailyValue: string | null;
  bestSwitch: SwitchRecommendation | null;
  workers: AdvisorWorker[];
  workersStatus: "ok" | "unavailable";
  incomeTaxRate: number;
  incomeTaxAssumed: boolean;
  offerWagePerPp: number | null;
};

export type SearchUsersResponse = {
  users: { userId: string; username: string }[];
};

export type AdvisorResponse = {
  recordedAt: string | null;
  companiesFetchedAt: number | null;
  companiesRefreshed: boolean;
  opportunities: Opportunity[];
  companies: CompanyAdvisorRow[];
};
