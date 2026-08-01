import type { JobDefinition } from "../types";
import { runRecommendedRegionsPoll } from "./run";

export const recommendedRegionsPollJob: JobDefinition = {
  id: "recommended-regions-poll",
  name: "Recommended Regions Poll",
  description: "Fetches best recommended region per producible item code; upserts cache",
  defaultCron: "0 0 * * * *",
  defaultEnabled: true,
  async run({ db, logger, warera }) {
    const result = await runRecommendedRegionsPoll({ db, warera, logger });
    return `${result.itemCount} items (${result.status}, ${result.errors} errors)`;
  },
};
