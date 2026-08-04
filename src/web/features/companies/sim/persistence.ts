import type { CompanySimState, SimPersistence } from "./types";

/** Session-only v1 seam: load always null; save is unused. */
export function createMemoryPersistence(): SimPersistence {
  return {
    load: () => null,
    save: (_state: CompanySimState) => {},
  };
}
