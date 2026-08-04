export type Opportunity = {
  itemCode: string;
  marketPrice: number;
  inputCost: number;
  unitProfit: number;
  consumedPp: number;
  profitPerPp: number | null;
  formula: string;
  bestBonus: number | null;
  bestRegionId: string | null;
  bestRegionName: string | null;
  roughDailyValue: number | null;
  referenceAeLevel: number;
};

export type AeDailyBreakdown = {
  aeLevel: number;
  bonus: number;
  profitPerPp: number;
  hoursPerDay: number;
  ppPerHour: number;
  dailyPp: number;
  dailyValue: number;
  formula: string;
};

export type ProfitPpBreakdown = {
  itemCode: string;
  marketPrice: number;
  inputCost: number;
  unitProfit: number;
  consumedPp: number;
  profitPerPp: number | null;
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
  profitPerPp: number;
  dailyValue: number;
  dailyDelta: number;
  retask: boolean;
  relocate: boolean;
  transferConcrete: number;
  transferGold: number;
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
  currentProfitPerPp: number | null;
  currentDailyValue: number | null;
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
