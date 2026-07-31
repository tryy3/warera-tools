export type Opportunity = {
  itemCode: string;
  marketPrice: number;
  inputCost: number;
  unitProfit: number;
  consumedPp: number;
  profitPerPp: number | null;
  formula: string;
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

export type CompanyAdvisorRow = {
  company: {
    id: string;
    name: string;
    itemCode: string | null;
    regionId: string | null;
    regionName: string | null;
    aeLevel: number;
    productionBonus: number | null;
  };
  bonusDetails: ProductionBonusDetails | null;
  profitBreakdown: ProfitPpBreakdown | null;
  aeBreakdown: AeDailyBreakdown | null;
  currentProfitPerPp: number | null;
  currentDailyValue: number | null;
  bestSwitch: SwitchRecommendation | null;
};

export type SearchUsersResponse = {
  users: { userId: string; username: string }[];
};

export type AdvisorResponse = {
  recordedAt: string | null;
  opportunities: Opportunity[];
  companies: CompanyAdvisorRow[];
};
