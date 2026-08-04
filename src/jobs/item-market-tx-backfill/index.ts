import type { JobDefinition } from "../types";
import { runItemMarketTxBackfill } from "./run";

export const itemMarketTxBackfillJob: JobDefinition = {
  id: "item-market-tx-backfill",
  name: "Item Market TX Backfill",
  description:
    "Once per process: walk itemMarket sales back ~24h (or until known ids); enables poll handoff after first page",
  defaultCron: "* * * * * *",
  defaultMaxRuns: 1,
  defaultEnabled: true,
  async run(ctx) {
    return runItemMarketTxBackfill(ctx);
  },
};
