import { createContext, use, type Dispatch } from "react";
import type { CompanySimAction, CompanySimState } from "./types";
import type { DerivedCompanyCard } from "./derive";

export type CompanySimContextValue = {
  state: CompanySimState;
  dispatch: Dispatch<CompanySimAction>;
  cards: DerivedCompanyCard[];
  /** Portfolio actual profit (internal transfers valued at transfer, not market). */
  portfolioActual: number;
  /** Portfolio mark-to-market profit (all outputs/inputs at book prices). */
  portfolioMarkToMarket: number;
  /** Alias of `portfolioActual` for backward compatibility. */
  portfolioNet: number;
};

export const CompanySimContext = createContext<CompanySimContextValue | null>(null);

export function useCompanySim(): CompanySimContextValue {
  const value = use(CompanySimContext);
  if (!value) {
    throw new Error("useCompanySim must be used within CompanySimProvider");
  }
  return value;
}
