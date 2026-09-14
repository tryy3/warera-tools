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
  /** Set when stopped with `page_budget` or `aborted` so the caller can resume. */
  resumeCursor: string | null;
};

const DEFAULT_PAGE_DELAY_MS = 300;
/** Default matches longest Market chart range (30d). */
const DEFAULT_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pageOldestMs(items: { createdAt: Date }[]): number {
  let oldestMs = items[0]!.createdAt.getTime();
  for (let i = 1; i < items.length; i++) {
    const t = items[i]!.createdAt.getTime();
    if (t < oldestMs) oldestMs = t;
  }
  return oldestMs;
}

export async function walkItemMarketTransactions(opts: {
  db: Db;
  logger: Logger;
  /**
   * - `backfill` / `poll`: stop at first known id (catch-up to tip).
   * - `deepen`: keep paging through known ids until lookback (fill older history).
   */
  mode: "backfill" | "poll" | "deepen";
  fetchPage: FetchItemMarketPage;
  pageDelayMs?: number;
  lookbackMs?: number;
  /** Absolute stop: page oldest < untilMs (preferred over lookback for long runs). */
  untilMs?: number;
  now?: Date;
  limit?: number;
  /** Resume deepen/backfill from this cursor (newest→older API). */
  startCursor?: string;
  /** Cap pages this invocation (deepen spreads work across poll ticks). */
  maxPages?: number;
  signal?: AbortSignal;
}): Promise<WalkItemMarketTransactionsResult> {
  const {
    db,
    logger,
    mode,
    fetchPage,
    pageDelayMs = DEFAULT_PAGE_DELAY_MS,
    lookbackMs = DEFAULT_LOOKBACK_MS,
    untilMs,
    now = new Date(),
    limit,
    startCursor,
    maxPages,
    signal,
  } = opts;

  let pages = 0;
  let inserted = 0;
  let cursor: string | undefined = startCursor;
  const useLookback = mode === "backfill" || mode === "deepen";
  const stopOnKnownId = mode !== "deepen";

  for (;;) {
    if (signal?.aborted) {
      return {
        pages,
        inserted,
        stoppedReason: "aborted",
        resumeCursor: cursor ?? null,
      };
    }

    if (maxPages != null && pages >= maxPages) {
      return {
        pages,
        inserted,
        stoppedReason: "page_budget",
        resumeCursor: cursor ?? null,
      };
    }

    const page = await fetchPage({ cursor, limit });
    if (signal?.aborted) {
      return {
        pages,
        inserted,
        stoppedReason: "aborted",
        resumeCursor: cursor ?? null,
      };
    }
    pages += 1;

    const { inserted: pageInserted, existingIds } =
      await insertItemMarketTransactionsIgnoreConflicts(db, page.items);
    inserted += pageInserted;

    // Handoff only after a successful backfill page is handled (fetch + insert).
    if (mode === "backfill") {
      enableItemMarketTxPoll();
    }

    const logPage = untilMs != null ? logger.info.bind(logger) : logger.debug.bind(logger);
    logPage(
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

    if (stopOnKnownId && existingIds.length > 0) {
      return { pages, inserted, stoppedReason: "known_id", resumeCursor: null };
    }

    if (useLookback && page.items.length > 0) {
      const boundMs = untilMs ?? now.getTime() - lookbackMs;
      if (pageOldestMs(page.items) < boundMs) {
        return {
          pages,
          inserted,
          stoppedReason: untilMs != null ? "until" : "lookback",
          resumeCursor: null,
        };
      }
    }

    if (page.items.length === 0) {
      return { pages, inserted, stoppedReason: "empty", resumeCursor: null };
    }

    if (page.nextCursor == null) {
      return { pages, inserted, stoppedReason: "no_cursor", resumeCursor: null };
    }

    cursor = page.nextCursor;

    if (signal?.aborted) {
      return {
        pages,
        inserted,
        stoppedReason: "aborted",
        resumeCursor: cursor,
      };
    }

    // Only throttle when we inserted new rows; skip delay while skipping known pages.
    if (useLookback && pageDelayMs > 0 && pageInserted > 0) {
      await sleep(pageDelayMs);
    }

    if (maxPages != null && pages >= maxPages) {
      return {
        pages,
        inserted,
        stoppedReason: "page_budget",
        resumeCursor: cursor,
      };
    }
  }
}
