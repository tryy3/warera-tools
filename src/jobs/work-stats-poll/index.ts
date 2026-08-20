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
    if (result.status === "error") {
      const first = result.errors[0] ?? "all work stats targets failed";
      throw new Error(
        `work stats poll failed: status=error, players=${result.playerCount}, companies=${result.companyCount}, workers=${result.workerCount}, errors=${result.errors.length}, first="${first}"`,
      );
    }
    return `${result.playerCount} players, ${result.companyCount} companies, ${result.workerCount} workers (${result.status})`;
  },
};
