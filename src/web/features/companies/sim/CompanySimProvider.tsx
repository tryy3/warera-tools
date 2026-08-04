import {
  createContext,
  use,
  useEffect,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from "react";
import type { CompanyAdvisorRow } from "../types";
import { deriveCompanyCard, derivePortfolioNet, type DerivedCompanyCard } from "./derive";
import { toHydratePayload } from "./hydrate";
import { companySimReducer, initialCompanySimState } from "./reducer";
import type { CompanySimAction, CompanySimState } from "./types";

export type OwnerDefaults = {
  entrepreneurshipLevel: number;
  productionSkillLevel: number;
};

export type CompanySimContextValue = {
  state: CompanySimState;
  dispatch: Dispatch<CompanySimAction>;
  cards: DerivedCompanyCard[];
  portfolioNet: number;
};

const CompanySimContext = createContext<CompanySimContextValue | null>(null);

function hydrateState(companies: CompanyAdvisorRow[], keepOverrides: boolean): CompanySimState {
  return companySimReducer(initialCompanySimState, {
    type: "hydrate",
    live: toHydratePayload(companies),
    keepOverrides,
  });
}

export function CompanySimProvider({
  companies,
  ownerDefaults,
  liveRevision,
  children,
}: {
  companies: CompanyAdvisorRow[];
  ownerDefaults: OwnerDefaults;
  /** Bumps when advisor pack is replaced (refresh / new fetch). */
  liveRevision: string | number;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(companySimReducer, companies, (initialCompanies) =>
    hydrateState(initialCompanies, false),
  );

  const prevRevisionRef = useRef(liveRevision);
  useEffect(() => {
    if (prevRevisionRef.current === liveRevision) return;
    prevRevisionRef.current = liveRevision;
    dispatch({
      type: "hydrate",
      live: toHydratePayload(companies),
      keepOverrides: true,
    });
  }, [liveRevision, companies]);

  const cards = companies.map((row) => deriveCompanyCard(row, state, ownerDefaults));
  const portfolioNet = derivePortfolioNet(cards);

  return (
    <CompanySimContext value={{ state, dispatch, cards, portfolioNet }}>
      {children}
    </CompanySimContext>
  );
}

export function useCompanySim(): CompanySimContextValue {
  const value = use(CompanySimContext);
  if (!value) {
    throw new Error("useCompanySim must be used within CompanySimProvider");
  }
  return value;
}
