import { fetchItemMarketTransactionsPage } from "../../warera/transactions";
import { isItemMarketTxPollEnabled } from "../item-market-tx/handoff";
import { walkItemMarketTransactions } from "../item-market-tx/ingest";
import type { JobContext } from "../types";

export async function runItemMarketTxPoll(ctx: JobContext) {
  if (!isItemMarketTxPollEnabled()) {
    return "waiting for backfill handoff";
  }
  const result = await walkItemMarketTransactions({
    db: ctx.db,
    logger: ctx.logger,
    mode: "poll",
    fetchPage: (opts) => fetchItemMarketTransactionsPage(ctx.warera, opts),
  });
  return `poll: ${result.inserted} inserted, ${result.pages} pages (${result.stoppedReason})`;
}
