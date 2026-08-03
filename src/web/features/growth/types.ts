export type { GrowthBootstrapResponse } from "@/growth/bootstrap";
export type { GrowthPathMode, GrowthPlanResult, GrowthPlanStep } from "@/growth/plan";
export type { UserCompany, UserResponse } from "@/user";

export type EditableFactory = {
  id: string;
  name: string;
  itemCode: string | null;
  aeLevel: number;
  goldPerAePerDay: number;
};

export type FocusedPath = "cheapest" | "income_roi" | "upgrade_first";
