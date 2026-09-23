import type { JobDefinition } from "../types";
import { runAllianceSync } from "./run";

export const allianceSyncJob: JobDefinition = {
  id: "alliance-sync",
  name: "Alliance Sync",
  description:
    "Fetches alliance.getManyPaginated and stores each alliance's coreDevelopment for battle-bonus share",
  defaultCron: "0 0 * * * *",
  defaultEnabled: true,
  async run({ db, logger, warera }) {
    const result = await runAllianceSync({ db, warera, logger });
    return `synced ${result.count} alliances`;
  },
};
