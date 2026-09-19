import { Decimal, parseMoney } from "../money/decimal";
import type { PlayerFill } from "./chunkFills";

export type RealizedSale = {
  at: Date;
  qty: number;
  proceeds: Decimal;
  cost: Decimal;
  pnl: Decimal;
};

export type CostBookResult = {
  realized: RealizedSale[];
  historyIncomplete: boolean;
  /** Remaining open buy lots after all fills (for Phase 2) */
  openLots: Array<{ qty: number; unitPrice: Decimal }>;
};

type OpenLot = { qty: number; unitPrice: Decimal };

function asMoney(money: Decimal | number): Decimal {
  return parseMoney(money)!;
}

export function runCostBook(fills: PlayerFill[]): CostBookResult {
  const sorted = [...fills].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const openLots: OpenLot[] = [];
  const realized: RealizedSale[] = [];
  let historyIncomplete = false;

  for (const fill of sorted) {
    if (fill.side === "buy") {
      openLots.push({
        qty: fill.quantity,
        unitPrice: asMoney(fill.money).div(fill.quantity),
      });
      continue;
    }

    let remainingSellQty = fill.quantity;
    let cost = new Decimal(0);

    while (remainingSellQty > 0 && openLots.length > 0) {
      const lot = openLots[0]!;
      const consumed = Math.min(remainingSellQty, lot.qty);
      cost = cost.plus(lot.unitPrice.times(consumed));
      remainingSellQty -= consumed;
      lot.qty -= consumed;
      if (lot.qty === 0) {
        openLots.shift();
      }
    }

    if (remainingSellQty > 0) {
      historyIncomplete = true;
    }

    const proceeds = asMoney(fill.money);
    // When history is incomplete, cost covers only matched lots; pnl is optimistic.
    realized.push({
      at: fill.createdAt,
      qty: fill.quantity,
      proceeds,
      cost,
      pnl: proceeds.minus(cost),
    });
  }

  return { realized, historyIncomplete, openLots };
}

export function sumRealizedPnl(realized: RealizedSale[], since: Date, until: Date): Decimal {
  const sinceMs = since.getTime();
  const untilMs = until.getTime();

  let sum = new Decimal(0);
  for (const sale of realized) {
    const atMs = sale.at.getTime();
    if (atMs >= sinceMs && atMs < untilMs) {
      sum = sum.plus(sale.pnl);
    }
  }
  return sum;
}
