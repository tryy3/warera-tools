import type { PlayerItemFillRow } from "../db/item-market-tx-player";
import { serializeMoney, type Decimal } from "../money/decimal";
import { chunkFills, type PlayerFill, type TradeChunk } from "./chunkFills";
import { runCostBook, sumRealizedPnl } from "./costBook";
import { rangeToMs, type PriceHistoryRange } from "./ranges";

export type MyTradesResult = {
  itemCode: string;
  playerId: string;
  range: PriceHistoryRange;
  chunks: Array<{
    side: "buy" | "sell";
    unitPrice: Decimal;
    totalQty: number;
    totalMoney: Decimal;
    startAt: Date;
    endAt: Date;
    fillCount: number;
  }>;
  realized: { pnl: Decimal | null; sellQty: number; buyQty: number };
  historyIncomplete: boolean;
  fillCount: number;
};

/** API wire shape for my-trades (money as strings). */
export function serializeMyTradesResult(result: MyTradesResult) {
  return {
    itemCode: result.itemCode,
    playerId: result.playerId,
    range: result.range,
    chunks: result.chunks.map((ch) => ({
      side: ch.side,
      unitPrice: serializeMoney(ch.unitPrice),
      totalQty: ch.totalQty,
      totalMoney: serializeMoney(ch.totalMoney),
      startAt: ch.startAt.toISOString(),
      endAt: ch.endAt.toISOString(),
      fillCount: ch.fillCount,
    })),
    realized: {
      pnl: serializeMoney(result.realized.pnl),
      sellQty: result.realized.sellQty,
      buyQty: result.realized.buyQty,
    },
    historyIncomplete: result.historyIncomplete,
    fillCount: result.fillCount,
  };
}

function rowsToFills(rows: PlayerItemFillRow[], playerId: string): PlayerFill[] {
  return rows.map((row) => ({
    id: row.id,
    side: row.buyerId === playerId ? ("buy" as const) : ("sell" as const),
    money: row.money,
    quantity: row.quantity,
    createdAt: row.createdAt,
  }));
}

function chunkOverlapsRange(chunk: TradeChunk, since: Date, until: Date): boolean {
  return chunk.endAt.getTime() >= since.getTime() && chunk.startAt.getTime() <= until.getTime();
}

function qtyInRange(fills: PlayerFill[], side: "buy" | "sell", since: Date, until: Date): number {
  const sinceMs = since.getTime();
  const untilMs = until.getTime();
  let total = 0;
  for (const fill of fills) {
    if (fill.side !== side) continue;
    const at = fill.createdAt.getTime();
    if (at >= sinceMs && at < untilMs) {
      total += fill.quantity;
    }
  }
  return total;
}

export function buildMyTrades(opts: {
  itemCode: string;
  playerId: string;
  range: PriceHistoryRange;
  now?: Date;
  rows: PlayerItemFillRow[];
}): MyTradesResult {
  const now = opts.now ?? new Date();
  const until = now;
  const since = new Date(now.getTime() - rangeToMs(opts.range));

  const fills = rowsToFills(opts.rows, opts.playerId);
  const book = runCostBook(fills);
  const allChunks = chunkFills(fills);
  const chunks = allChunks.filter((chunk) => chunkOverlapsRange(chunk, since, until));
  const pnl = sumRealizedPnl(book.realized, since, until);

  return {
    itemCode: opts.itemCode,
    playerId: opts.playerId,
    range: opts.range,
    chunks,
    realized: {
      pnl,
      sellQty: qtyInRange(fills, "sell", since, until),
      buyQty: qtyInRange(fills, "buy", since, until),
    },
    historyIncomplete: book.historyIncomplete,
    fillCount: fills.length,
  };
}
