import type { JobDefinition } from "../types";
import { runMuMemberPoll } from "./run";

export const muMemberPollJob: JobDefinition = {
  id: "mu-member-poll",
  name: "MU Member Poll",
  description:
    "Batch-fetches user.getUserById for members of watched MUs and appends activity/identity snapshots",
  defaultCron: "0 */5 * * * *",
  defaultEnabled: true,
  async run({ db, logger, warera }) {
    const result = await runMuMemberPoll({ db, warera, logger });
    return `poll #${result.pollId}: ${result.userCount} users across ${result.muCount} MUs (${result.status})`;
  },
};
