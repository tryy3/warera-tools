import { describe, expect, it } from "vite-plus/test";
import type { PlayerItemFillRow } from "../db/item-market-tx-player";
import { buildMyTrades } from "./buildMyTrades";

function row(
  partial: Partial<PlayerItemFillRow> &
    Pick<PlayerItemFillRow, "id" | "money" | "quantity" | "buyerId" | "sellerId" | "createdAt">,
): PlayerItemFillRow {
  return partial;
}

describe("buildMyTrades", () => {
  const playerId = "player1";
  const itemCode = "chest4";

  it("chunks fills in range and realizes FIFO pnl using older buys", () => {
    const now = new Date("2026-09-10T12:00:00Z");
    // Outside 7d window (since = Sep 3 12:00) but needed for cost basis
    const oldBuy = row({
      id: "b-old",
      money: 100,
      quantity: 100,
      buyerId: playerId,
      sellerId: "s",
      createdAt: new Date("2026-08-01T10:00:00Z"),
    });
    const sellInRange = row({
      id: "s1",
      money: 60,
      quantity: 50,
      buyerId: "b",
      sellerId: playerId,
      createdAt: new Date("2026-09-08T10:00:00Z"),
    });
    const buyInRange = row({
      id: "b1",
      money: 20,
      quantity: 10,
      buyerId: playerId,
      sellerId: "s",
      createdAt: new Date("2026-09-09T10:00:00Z"),
    });

    const result = buildMyTrades({
      itemCode,
      playerId,
      range: "7d",
      now,
      rows: [oldBuy, sellInRange, buyInRange],
    });

    expect(result.itemCode).toBe(itemCode);
    expect(result.playerId).toBe(playerId);
    expect(result.range).toBe("7d");
    expect(result.fillCount).toBe(3);
    expect(result.historyIncomplete).toBe(false);

    expect(result.realized.buyQty).toBe(10);
    expect(result.realized.sellQty).toBe(50);
    expect(result.realized.pnl).toBe(10); // 60 proceeds - 50 cost

    // Old buy chunk filtered out; in-range sell + buy remain
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks.map((c) => c.side)).toEqual(["sell", "buy"]);
    expect(result.chunks[0]).toMatchObject({
      side: "sell",
      totalQty: 50,
      totalMoney: 60,
      fillCount: 1,
    });
    expect(result.chunks[1]).toMatchObject({
      side: "buy",
      totalQty: 10,
      totalMoney: 20,
      fillCount: 1,
    });
  });

  it("flags historyIncomplete when sells lack matching buys", () => {
    const now = new Date("2026-09-10T12:00:00Z");
    const result = buildMyTrades({
      itemCode,
      playerId,
      range: "7d",
      now,
      rows: [
        row({
          id: "s1",
          money: 10,
          quantity: 10,
          buyerId: "b",
          sellerId: playerId,
          createdAt: new Date("2026-09-08T10:00:00Z"),
        }),
      ],
    });

    expect(result.historyIncomplete).toBe(true);
    expect(result.realized.sellQty).toBe(10);
    expect(result.realized.buyQty).toBe(0);
    expect(result.realized.pnl).toBe(10); // optimistic: cost 0
  });

  it("includes chunk that overlaps range even if start is before since", () => {
    const now = new Date("2026-09-10T12:00:00Z");
    // 7d since = Sep 3 12:00. Two same-price buys within 1h: one before since, one after → one chunk spanning boundary
    const result = buildMyTrades({
      itemCode,
      playerId,
      range: "7d",
      now,
      rows: [
        row({
          id: "b0",
          money: 10,
          quantity: 10,
          buyerId: playerId,
          sellerId: "s",
          createdAt: new Date("2026-09-03T11:30:00Z"),
        }),
        row({
          id: "b1",
          money: 10,
          quantity: 10,
          buyerId: playerId,
          sellerId: "s",
          createdAt: new Date("2026-09-03T12:15:00Z"),
        }),
      ],
    });

    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]).toMatchObject({
      side: "buy",
      totalQty: 20,
      fillCount: 2,
    });
    expect(result.realized.buyQty).toBe(10); // only fill at/after since
  });

  it("returns empty chunks and zero qtys when no fills", () => {
    const result = buildMyTrades({
      itemCode,
      playerId,
      range: "24h",
      now: new Date("2026-09-10T12:00:00Z"),
      rows: [],
    });

    expect(result.chunks).toEqual([]);
    expect(result.fillCount).toBe(0);
    expect(result.realized).toEqual({ pnl: 0, sellQty: 0, buyQty: 0 });
    expect(result.historyIncomplete).toBe(false);
  });
});
