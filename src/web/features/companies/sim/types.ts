import type { AdvisorWorker } from "../types";

export type SimWorker = {
  id: string;
  kind: "real" | "simulated";
  name: string;
  assignment: string | null;
  wagePerPp: number;
  energyLevel: number;
  productionLevel: number;
  fidelityPct: number;
  assumedFields: string[];
  dirty: boolean;
};

export type CompanyOverrides = {
  aeLevel?: number;
  productionBonus?: number;
  entrepreneurshipLevel?: number;
  productionSkillLevel?: number;
  offerWagePerPp?: number;
  includeSelfWork?: boolean;
};

export type CompanySimState = {
  workers: SimWorker[];
  overrides: Record<string, CompanyOverrides>;
  liveEpoch: number; // bumps on hydrate from fresh advisor
};

export type HydrateCompany = {
  companyId: string;
  offerWagePerPp: number | null;
  workers: AdvisorWorker[];
};

export type HydratePayload = {
  companies: HydrateCompany[];
};

export type CompanySimAction =
  | { type: "hydrate"; live: HydratePayload; keepOverrides: boolean }
  | { type: "setCompanyOverride"; companyId: string; patch: CompanyOverrides }
  | { type: "resetCompany"; companyId: string; live: HydratePayload }
  | { type: "addSimWorker"; worker: SimWorker }
  | { type: "updateWorker"; id: string; patch: Partial<SimWorker> }
  | { type: "setAssignment"; id: string; assignment: string | null }
  | { type: "removeSimWorker"; id: string };

export type SimPersistence = {
  load(): CompanySimState | null;
  save(state: CompanySimState): void;
};
