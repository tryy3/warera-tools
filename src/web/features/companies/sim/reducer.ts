import type { AdvisorWorker } from "../types";
import type {
  CompanySimAction,
  CompanySimState,
  HydrateCompany,
  HydratePayload,
  SimWorker,
} from "./types";

export const initialCompanySimState: CompanySimState = {
  workers: [],
  overrides: {},
  liveEpoch: 0,
};

function simWorkerFromAdvisor(
  worker: AdvisorWorker,
  companyId: string,
  offerWagePerPp: number | null,
): SimWorker {
  const assumedFields: string[] = [];

  let wagePerPp: number;
  if (worker.wagePerPp == null) {
    wagePerPp = offerWagePerPp ?? 0;
    assumedFields.push("wagePerPp");
  } else {
    wagePerPp = worker.wagePerPp;
  }

  let energyLevel: number;
  if (worker.energyLevel == null) {
    energyLevel = 5;
    assumedFields.push("energyLevel");
  } else {
    energyLevel = worker.energyLevel;
  }

  let productionLevel: number;
  if (worker.productionLevel == null) {
    productionLevel = 5;
    assumedFields.push("productionLevel");
  } else {
    productionLevel = worker.productionLevel;
  }

  let fidelityPct: number;
  if (worker.fidelityPct == null) {
    fidelityPct = 0;
    assumedFields.push("fidelityPct");
  } else {
    fidelityPct = worker.fidelityPct;
  }

  return {
    id: worker.userId,
    kind: "real",
    name: worker.username ?? worker.userId,
    assignment: companyId,
    wagePerPp,
    energyLevel,
    productionLevel,
    fidelityPct,
    assumedFields,
    dirty: false,
  };
}

function realWorkersFromHydrateCompany(company: HydrateCompany): SimWorker[] {
  return company.workers.map((w) =>
    simWorkerFromAdvisor(w, company.companyId, company.offerWagePerPp),
  );
}

function realWorkersFromPayload(live: HydratePayload): SimWorker[] {
  return live.companies.flatMap(realWorkersFromHydrateCompany);
}

function findHydrateCompany(live: HydratePayload, companyId: string): HydrateCompany | undefined {
  return live.companies.find((c) => c.companyId === companyId);
}

function patchWorker(workers: SimWorker[], id: string, patch: Partial<SimWorker>): SimWorker[] {
  return workers.map((w) =>
    w.id === id ? { ...w, ...patch, id: w.id, kind: w.kind, dirty: true } : w,
  );
}

export function companySimReducer(
  state: CompanySimState,
  action: CompanySimAction,
): CompanySimState {
  switch (action.type) {
    case "hydrate": {
      const simulated = state.workers.filter((w) => w.kind === "simulated");
      return {
        workers: [...realWorkersFromPayload(action.live), ...simulated],
        overrides: action.keepOverrides ? state.overrides : {},
        liveEpoch: state.liveEpoch + 1,
      };
    }

    case "setCompanyOverride": {
      const prev = state.overrides[action.companyId] ?? {};
      return {
        ...state,
        overrides: {
          ...state.overrides,
          [action.companyId]: { ...prev, ...action.patch },
        },
      };
    }

    case "resetCompany": {
      const company = findHydrateCompany(action.live, action.companyId);
      const liveIds = new Set(company?.workers.map((w) => w.userId) ?? []);
      const restored = company ? realWorkersFromHydrateCompany(company) : [];

      const kept = state.workers.filter((w) => {
        if (w.kind === "simulated") return true;
        if (liveIds.has(w.id)) return false;
        return true;
      });

      const { [action.companyId]: _removed, ...overrides } = state.overrides;

      return {
        ...state,
        overrides,
        workers: [...kept, ...restored],
      };
    }

    case "addSimWorker":
      return {
        ...state,
        workers: [...state.workers, action.worker],
      };

    case "updateWorker":
      return {
        ...state,
        workers: patchWorker(state.workers, action.id, action.patch),
      };

    case "setAssignment":
      return {
        ...state,
        workers: patchWorker(state.workers, action.id, {
          assignment: action.assignment,
        }),
      };

    case "removeSimWorker":
      return {
        ...state,
        workers: state.workers.filter((w) => !(w.id === action.id && w.kind === "simulated")),
      };

    default:
      return state;
  }
}
