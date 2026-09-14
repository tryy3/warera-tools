import type { PlayerFill } from "./chunkFills";

export type RealizedSale = {
  at: Date;
  qty: number;
  proceeds: number;
  cost: number;
  pnl: number;
};

export type CostBookResult = {
  realized: RealizedSale[];
  historyIncomplete: boolean;
  /** Remaining open buy lots after all fills (for Phase 2) */
  openLots: Array<{ qty: number; unitPrice: number }>;
};

type OpenLot = { qty: number; unitPrice: number };

export function runCostBook(fills: PlayerFill[]): CostBookResult {
  const sorted = [...fills].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const openLots: OpenLot[] = [];
  const realized: RealizedSale[] = [];
  let historyIncomplete = false;

  for (const fill of sorted) {
    if (fill.side === "buy") {
      openLots.push({
        qty: fill.quantity,
        unitPrice: fill.money / fill.quantity,
      });
      continue;
    }

    let remainingSellQty = fill.quantity;
    let cost = 0;

    while (remainingSellQty > 0 && openLots.length > 0) {
      const lot = openLots[0]!;
      const consumed = Math.min(remainingSellQty, lot.qty);
      cost += consumed * lot.unitPrice;
      remainingSellQty -= consumed;
      lot.qty -= consumed;
      if (lot.qty === 0) {
        openLots.shift();
      }
    }

    if (remainingSellQty > 0) {
      historyIncomplete = true;
    }

    const proceeds = fill.money;
    // When history is incomplete, cost covers only matched lots; pnl is optimistic.
    realized.push({
      at: fill.createdAt,
      qty: fill.quantity,
      proceeds,
      cost,
      pnl: proceeds - cost,
    });
  }

  return { realized, historyIncomplete, openLots };
}

export function sumRealizedPnl(realized: RealizedSale[], since: Date, until: Date): number {
  const sinceMs = since.getTime();
  const untilMs = until.getTime();

  return realized
    .filter((sale) => {
      const atMs = sale.at.getTime();
      return atMs >= sinceMs && atMs < untilMs;
    })
    .reduce((sum, sale) => sum + sale.pnl, 0);
}
