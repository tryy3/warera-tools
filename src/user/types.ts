import type { DailyIncomeBreakdown } from "../skills/income";
import type { SkillsJob } from "../skills/job-wage";
import type { UserLiteSkills } from "../warera/users";

export type UserSkill = {
  level: number;
  value: number;
};

export type UserCompany = {
  id: string;
  name: string;
  aeLevel: number;
  itemCode: string | null;
  productionBonus: number;
  profitPerPp: number;
  goldPerAePerDay: number;
};

export type UserIncome = DailyIncomeBreakdown;

export type UserResponse = {
  userId: string;
  username: string;
  recordedAt: string | null;
  companiesFetchedAt: number | null;
  companiesRefreshed: boolean;
  leveling: UserLiteSkills["leveling"];
  skills: Record<string, UserSkill>;
  job: SkillsJob;
  companies: UserCompany[];
  income: UserIncome;
};
