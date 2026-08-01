import type { JobDefinition } from "../types";
import { runRegionSync } from "./run";

export const regionSyncJob: JobDefinition = {
  id: "region-sync",
  name: "Region Sync",
  description: "Refreshes region.getById for all known watchlist region ids",
  defaultCron: "0 5 * * * *", // hourly at :05 — stagger after recommended-regions-poll
  defaultEnabled: true,
  async run({ db, logger, warera }) {
    const result = await runRegionSync({ db, warera, logger });
    return `${result.regionCount} regions (${result.status}, ${result.errors} errors)`;
  },
};
