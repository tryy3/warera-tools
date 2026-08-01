import type { JobDefinition } from "../types";
import { runCountrySync } from "./run";

export const countrySyncJob: JobDefinition = {
  id: "country-sync",
  name: "Country Sync",
  description: "Fetches country.getAllCountries and syncs tax rates and metadata to the local DB",
  defaultCron: "0 0 0 * * *", // daily at midnight
  defaultEnabled: true,
  async run({ db, logger, warera }) {
    const result = await runCountrySync({ db, warera, logger });
    return `synced ${result.total} (inserted ${result.inserted}, updated ${result.updated}, migrated ${result.migrated})`;
  },
};
