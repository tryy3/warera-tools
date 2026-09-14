import { eq, min } from "drizzle-orm";
import type { Db } from "../../db/client";
import { itemMarketTransactions } from "../../db/schema";
import { PRICE_HISTORY_MAX_MS } from "../../market/ranges";
import {
  COMMODITY_TRANSACTION_TYPE,
  fetchItemMarketTransactionsPage,
} from "../../warera/transactions";
import {
  isCommodityDeepenDone,
  isItemMarketTxPollEnabled,
  markCommodityDeepenDone,
} from "../item-market-tx/handoff";
import { walkItemMarketTransactions } from "../item-market-tx/ingest";
import type { JobContext } from "../types";

const TRANSACTION_TYPES = ["itemMarket", COMMODITY_TRANSACTION_TYPE] as const;
/** Keep each poll tick short — resume deepen via job state cursor. */
const DEEPEN_MAX_PAGES = 40;
const DEEPEN_PAGE_DELAY_MS = 300;
const DEEPEN_CURSOR_STATE_KEY = "tradingDeepenCursor";

/** Stop reasons that mean commodity history covers the chart max range (or API end). */
const DEEPEN_COMPLETE_REASONS = new Set(["lookback", "empty", "no_cursor"]);

async function oldestCommodityCreatedAt(db: Db): Promise<Date | null> {
  const rows = await db
    .select({ oldest: min(itemMarketTransactions.createdAt) })
    .from(itemMarketTransactions)
    .where(eq(itemMarketTransactions.transactionType, COMMODITY_TRANSACTION_TYPE));
  return rows[0]?.oldest ?? null;
}

function readDeepenCursor(state: Record<string, unknown> | null): string | undefined {
  const v = state?.[DEEPEN_CURSOR_STATE_KEY];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

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

  if (!isCommodityDeepenDone()) {
    const oldest = await oldestCommodityCreatedAt(ctx.db);
    const covered =
      oldest != null && oldest.getTime() <= Date.now() - PRICE_HISTORY_MAX_MS;
    if (covered) {
      markCommodityDeepenDone();
      await ctx.setState({
        ...(ctx.state ?? {}),
        [DEEPEN_CURSOR_STATE_KEY]: null,
      });
      parts.push("trading-deepen: skipped (already covers 30d)");
    } else {
      const startCursor = readDeepenCursor(ctx.state);
      const deepen = await walkItemMarketTransactions({
        db: ctx.db,
        logger: ctx.logger,
        mode: "deepen",
        pageDelayMs: DEEPEN_PAGE_DELAY_MS,
        lookbackMs: PRICE_HISTORY_MAX_MS,
        maxPages: DEEPEN_MAX_PAGES,
        startCursor,
        fetchPage: (opts) =>
          fetchItemMarketTransactionsPage(ctx.warera, {
            ...opts,
            transactionType: COMMODITY_TRANSACTION_TYPE,
          }),
      });
      parts.push(
        `trading-deepen: ${deepen.inserted} inserted, ${deepen.pages} pages (${deepen.stoppedReason})`,
      );

      if (DEEPEN_COMPLETE_REASONS.has(deepen.stoppedReason)) {
        markCommodityDeepenDone();
        await ctx.setState({
          ...(ctx.state ?? {}),
          [DEEPEN_CURSOR_STATE_KEY]: null,
        });
      } else if (deepen.stoppedReason === "page_budget" && deepen.resumeCursor) {
        await ctx.setState({
          ...(ctx.state ?? {}),
          [DEEPEN_CURSOR_STATE_KEY]: deepen.resumeCursor,
        });
      }
    }
  }

  return `poll: ${parts.join("; ")}`;
}
