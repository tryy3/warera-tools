import type { JobDefinition } from "../types";
import { runDonationPoll } from "./run";

export const donationPollJob: JobDefinition = {
  id: "donation-poll",
  name: "Donation Poll",
  description:
    "Hourly drain of donation.getManyPaginated for watched MUs and countries; appends donor running-total snapshots",
  defaultCron: "0 0 * * * *",
  defaultEnabled: true,
  async run({ db, logger, warera }) {
    const result = await runDonationPoll({ db, warera, logger });
    return `poll #${result.pollId}: ${result.scopeCount} scopes, ${result.rowCount} rows (${result.status})`;
  },
};
