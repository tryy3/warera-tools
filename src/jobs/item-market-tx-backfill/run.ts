import { PRICE_HISTORY_MAX_MS } from "../../market/ranges";
import {
  COMMODITY_TRANSACTION_TYPE,
  fetchItemMarketTransactionsPage,
} from "../../warera/transactions";
import { walkItemMarketTransactions } from "../item-market-tx/ingest";
import type { JobContext } from "../types";

const PAGE_DELAY_MS = 300;
const TRANSACTION_TYPES = ["itemMarket", COMMODITY_TRANSACTION_TYPE] as const;

export async function runItemMarketTxBackfill(ctx: JobContext) {
  const parts: string[] = [];
  for (const transactionType of TRANSACTION_TYPES) {
    const result = await walkItemMarketTransactions({
      db: ctx.db,
      logger: ctx.logger,
      mode: "backfill",
      pageDelayMs: PAGE_DELAY_MS,
      lookbackMs: PRICE_HISTORY_MAX_MS,
      fetchPage: (opts) =>
        fetchItemMarketTransactionsPage(ctx.warera, { ...opts, transactionType }),
    });
    parts.push(
      `${transactionType}: ${result.inserted} inserted, ${result.pages} pages (${result.stoppedReason})`,
    );
  }
  return `backfill: ${parts.join("; ")}`;
}
