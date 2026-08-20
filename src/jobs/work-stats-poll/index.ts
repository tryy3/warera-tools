import type { JobDefinition } from "../types";
import { runWorkStatsPoll } from "./run";

export const workStatsPollJob: JobDefinition = {
  id: "work-stats-poll",
  name: "Work Stats Poll",
  description:
    "Hourly upsert of company and worker daily work stats for followed players’ factories",
  defaultCron: "0 10 * * * *",
  defaultEnabled: true,
  async run({ db, logger, warera }) {
    const result = await runWorkStatsPoll({ db, warera, logger });
    return `${result.playerCount} players, ${result.companyCount} companies, ${result.workerCount} workers (${result.status})`;
  },
};
