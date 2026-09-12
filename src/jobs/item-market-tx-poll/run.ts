import {
  COMMODITY_TRANSACTION_TYPE,
  fetchItemMarketTransactionsPage,
} from "../../warera/transactions";
import { isItemMarketTxPollEnabled } from "../item-market-tx/handoff";
import { walkItemMarketTransactions } from "../item-market-tx/ingest";
import type { JobContext } from "../types";

const TRANSACTION_TYPES = ["itemMarket", COMMODITY_TRANSACTION_TYPE] as const;

export async function runItemMarketTxPoll(ctx: JobContext) {
  if (!isItemMarketTxPollEnabled()) {
    return "waiting for backfill handoff";
  }
  const parts: string[] = [];
  for (const transactionType of TRANSACTION_TYPES) {
    const result = await walkItemMarketTransactions({
      db: ctx.db,
      logger: ctx.logger,
      mode: "poll",
      fetchPage: (opts) =>
        fetchItemMarketTransactionsPage(ctx.warera, { ...opts, transactionType }),
    });
    parts.push(
      `${transactionType}: ${result.inserted} inserted, ${result.pages} pages (${result.stoppedReason})`,
    );
  }
  return `poll: ${parts.join("; ")}`;
}
