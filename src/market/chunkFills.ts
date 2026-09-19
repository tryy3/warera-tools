import { Decimal, parseMoney } from "../money/decimal";

export type FillSide = "buy" | "sell";

export type PlayerFill = {
  id: string;
  side: FillSide;
  money: Decimal | number;
  quantity: number;
  createdAt: Date;
};

export type TradeChunk = {
  side: FillSide;
  unitPrice: Decimal;
  totalQty: number;
  totalMoney: Decimal;
  startAt: Date;
  endAt: Date;
  fillCount: number;
};

export const CHUNK_GAP_MS = 60 * 60 * 1000;
export const UNIT_PRICE_DECIMALS = 6;

function asMoney(money: Decimal | number): Decimal {
  return parseMoney(money)!;
}

export function unitPrice(money: Decimal | number, quantity: number): Decimal {
  return asMoney(money).div(quantity);
}

export function roundUnitPrice(price: Decimal): Decimal {
  return price.toDecimalPlaces(UNIT_PRICE_DECIMALS, Decimal.ROUND_HALF_UP);
}

type OpenChunk = {
  side: FillSide;
  priceKey: string;
  totalQty: number;
  totalMoney: Decimal;
  startAt: Date;
  endAt: Date;
  fillCount: number;
};

function closeChunk(open: OpenChunk): TradeChunk {
  return {
    side: open.side,
    unitPrice: open.totalMoney.div(open.totalQty),
    totalQty: open.totalQty,
    totalMoney: open.totalMoney,
    startAt: open.startAt,
    endAt: open.endAt,
    fillCount: open.fillCount,
  };
}

function startChunk(fill: PlayerFill, priceKey: string): OpenChunk {
  return {
    side: fill.side,
    priceKey,
    totalQty: fill.quantity,
    totalMoney: asMoney(fill.money),
    startAt: fill.createdAt,
    endAt: fill.createdAt,
    fillCount: 1,
  };
}

function chunkSideStream(fills: PlayerFill[]): TradeChunk[] {
  if (fills.length === 0) {
    return [];
  }

  const sorted = [...fills].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const chunks: TradeChunk[] = [];
  let open: OpenChunk | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const fill = sorted[i]!;
    const prev = i > 0 ? sorted[i - 1]! : null;
    const priceKey = roundUnitPrice(unitPrice(fill.money, fill.quantity)).toFixed();

    const canAppend =
      open !== null &&
      priceKey === open.priceKey &&
      prev !== null &&
      fill.createdAt.getTime() - prev.createdAt.getTime() <= CHUNK_GAP_MS;

    if (canAppend && open) {
      open.totalQty += fill.quantity;
      open.totalMoney = open.totalMoney.plus(asMoney(fill.money));
      open.endAt = fill.createdAt;
      open.fillCount += 1;
    } else {
      if (open) {
        chunks.push(closeChunk(open));
      }
      open = startChunk(fill, priceKey);
    }
  }

  if (open) {
    chunks.push(closeChunk(open));
  }

  return chunks;
}

export function chunkFills(fills: PlayerFill[]): TradeChunk[] {
  if (fills.length === 0) {
    return [];
  }

  const buys = fills.filter((fill) => fill.side === "buy");
  const sells = fills.filter((fill) => fill.side === "sell");

  return [...chunkSideStream(buys), ...chunkSideStream(sells)].sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime(),
  );
}
