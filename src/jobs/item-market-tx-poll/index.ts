import type { JobDefinition } from "../types";
import { runItemMarketTxPoll } from "./run";

export const itemMarketTxPollJob: JobDefinition = {
  id: "item-market-tx-poll",
  name: "Item Market TX Poll",
  description:
    "Every minute: tip catch-up for itemMarket + trading; deepen trading toward Market chart max (30d) in ~40-page budgets with job-state resume; waits for backfill handoff before any API calls",
  defaultCron: "0 * * * * *",
  defaultEnabled: true,
  async run(ctx) {
    return runItemMarketTxPoll(ctx);
  },
};
