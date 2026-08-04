import type { JobDefinition } from "../types";
import { runItemMarketTxPoll } from "./run";

export const itemMarketTxPollJob: JobDefinition = {
  id: "item-market-tx-poll",
  name: "Item Market TX Poll",
  description:
    "Every minute: walk new itemMarket sales until known ids; waits for backfill handoff before any API calls",
  defaultCron: "0 * * * * *",
  defaultEnabled: true,
  async run(ctx) {
    return runItemMarketTxPoll(ctx);
  },
};
