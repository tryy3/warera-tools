import { insertItemMarketTransactionsIgnoreConflicts } from "../../db/item-market-transactions";
import type { Db } from "../../db/client";
import type { Logger } from "../../logging/logger";
import type { ItemMarketTransactionsPage } from "../../warera/transactions";
import { enableItemMarketTxPoll } from "./handoff";

export type FetchItemMarketPage = (opts: {
  cursor?: string;
  limit?: number;
}) => Promise<ItemMarketTransactionsPage>;

export type WalkItemMarketTransactionsResult = {
  pages: number;
  inserted: number;
  stoppedReason: string;
};

const DEFAULT_PAGE_DELAY_MS = 300;
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function walkItemMarketTransactions(opts: {
  db: Db;
  logger: Logger;
  mode: "backfill" | "poll";
  fetchPage: FetchItemMarketPage;
  pageDelayMs?: number;
  lookbackMs?: number;
  now?: Date;
  limit?: number;
}): Promise<WalkItemMarketTransactionsResult> {
  const {
    db,
    logger,
    mode,
    fetchPage,
    pageDelayMs = DEFAULT_PAGE_DELAY_MS,
    lookbackMs = DEFAULT_LOOKBACK_MS,
    now = new Date(),
    limit,
  } = opts;

  let pages = 0;
  let inserted = 0;
  let cursor: string | undefined;

  for (;;) {
    const page = await fetchPage({ cursor, limit });
    pages += 1;

    const { inserted: pageInserted, existingIds } =
      await insertItemMarketTransactionsIgnoreConflicts(db, page.items);
    inserted += pageInserted;

    // Handoff only after a successful backfill page is handled (fetch + insert).
    if (mode === "backfill") {
      enableItemMarketTxPoll();
    }

    logger.debug(
      {
        mode,
        pages,
        pageInserted,
        existingCount: existingIds.length,
        itemCount: page.items.length,
        cursor: cursor ?? null,
      },
      "item market tx page ingested",
    );

    if (existingIds.length > 0) {
      return { pages, inserted, stoppedReason: "known_id" };
    }

    if (mode === "backfill" && page.items.length > 0) {
      let oldestMs = page.items[0]!.createdAt.getTime();
      for (let i = 1; i < page.items.length; i++) {
        const t = page.items[i]!.createdAt.getTime();
        if (t < oldestMs) oldestMs = t;
      }
      if (oldestMs < now.getTime() - lookbackMs) {
        return { pages, inserted, stoppedReason: "lookback" };
      }
    }

    if (page.items.length === 0) {
      return { pages, inserted, stoppedReason: "empty" };
    }

    if (page.nextCursor == null) {
      return { pages, inserted, stoppedReason: "no_cursor" };
    }

    cursor = page.nextCursor;
    if (mode === "backfill" && pageDelayMs > 0) {
      await sleep(pageDelayMs);
    }
  }
}
