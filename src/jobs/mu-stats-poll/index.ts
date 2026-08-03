import type { JobDefinition } from "../types";
import { runMuStatsPoll } from "./run";

export const muStatsPollJob: JobDefinition = {
  id: "mu-stats-poll",
  name: "MU Stats Poll",
  description:
    "Fetches mu.getById + muMember.getByMu for watchlist MUs; upserts current roster and appends stat snapshots",
  defaultCron: "0 */30 * * * *",
  defaultEnabled: true,
  async run({ db, logger, warera }) {
    const result = await runMuStatsPoll({ db, warera, logger });
    return `poll #${result.pollId}: ${result.muCount} MUs, ${result.memberCount} members (${result.status})`;
  },
};
