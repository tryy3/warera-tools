import { fetchItemMarketTransactionsPage } from "../../warera/transactions";
import { walkItemMarketTransactions } from "../item-market-tx/ingest";
import type { JobContext } from "../types";

const PAGE_DELAY_MS = 300;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

export async function runItemMarketTxBackfill(ctx: JobContext) {
  const result = await walkItemMarketTransactions({
    db: ctx.db,
    logger: ctx.logger,
    mode: "backfill",
    pageDelayMs: PAGE_DELAY_MS,
    lookbackMs: LOOKBACK_MS,
    fetchPage: (opts) => fetchItemMarketTransactionsPage(ctx.warera, opts),
  });
  return `backfill: ${result.inserted} inserted, ${result.pages} pages (${result.stoppedReason})`;
}
