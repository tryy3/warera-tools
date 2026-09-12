export type FillSide = "buy" | "sell";

export type PlayerFill = {
  id: string;
  side: FillSide;
  money: number;
  quantity: number;
  createdAt: Date;
};

export type TradeChunk = {
  side: FillSide;
  unitPrice: number;
  totalQty: number;
  totalMoney: number;
  startAt: Date;
  endAt: Date;
  fillCount: number;
};

export const CHUNK_GAP_MS = 60 * 60 * 1000;
export const UNIT_PRICE_DECIMALS = 6;

export function unitPrice(money: number, quantity: number): number {
  return money / quantity;
}

export function roundUnitPrice(price: number): number {
  const factor = 10 ** UNIT_PRICE_DECIMALS;
  return Math.round(price * factor) / factor;
}

type OpenChunk = {
  side: FillSide;
  priceKey: number;
  totalQty: number;
  totalMoney: number;
  startAt: Date;
  endAt: Date;
  fillCount: number;
};

function closeChunk(open: OpenChunk): TradeChunk {
  return {
    side: open.side,
    unitPrice: open.totalMoney / open.totalQty,
    totalQty: open.totalQty,
    totalMoney: open.totalMoney,
    startAt: open.startAt,
    endAt: open.endAt,
    fillCount: open.fillCount,
  };
}

function startChunk(fill: PlayerFill, priceKey: number): OpenChunk {
  return {
    side: fill.side,
    priceKey,
    totalQty: fill.quantity,
    totalMoney: fill.money,
    startAt: fill.createdAt,
    endAt: fill.createdAt,
    fillCount: 1,
  };
}

function chunkSideStream(fills: PlayerFill[]): TradeChunk[] {
  if (fills.length === 0) {
    return [];
  }

  const sorted = [...fills].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const chunks: TradeChunk[] = [];
  let open: OpenChunk | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const fill = sorted[i]!;
    const prev = i > 0 ? sorted[i - 1]! : null;
    const priceKey = roundUnitPrice(unitPrice(fill.money, fill.quantity));

    const canAppend =
      open !== null &&
      priceKey === open.priceKey &&
      prev !== null &&
      fill.createdAt.getTime() - prev.createdAt.getTime() <= CHUNK_GAP_MS;

    if (canAppend && open) {
      open.totalQty += fill.quantity;
      open.totalMoney += fill.money;
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
