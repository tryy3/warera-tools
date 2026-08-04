import type { CompanyAdvisorRow } from "../types";
import type { HydratePayload } from "./types";

export function toHydratePayload(companies: CompanyAdvisorRow[]): HydratePayload {
  return {
    companies: companies.map((row) => ({
      companyId: row.company.id,
      offerWagePerPp: row.offerWagePerPp,
      workers: row.workers,
    })),
  };
}
