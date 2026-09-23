import type { JobDefinition } from "../types";
import { runMuFightPoll } from "./run";

export const muFightPollJob: JobDefinition = {
  id: "mu-fight-poll",
  name: "MU Fight Poll",
  description: "Batch-fetches fight state for members of watched MUs and appends changed snapshots",
  defaultCron: "0 */5 * * * *",
  defaultEnabled: true,
  async run({ db, logger, warera }) {
    const result = await runMuFightPoll({ db, warera, logger });
    return `poll #${result.pollId}: ${result.userCount} users across ${result.muCount} MUs (${result.status})`;
  },
};
