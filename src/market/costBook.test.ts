import { describe, expect, it } from "vite-plus/test";
import { runCostBook, sumRealizedPnl } from "./costBook";
import type { PlayerFill } from "./chunkFills";

describe("runCostBook", () => {
  it("realizes FIFO PnL on sell", () => {
    const fills: PlayerFill[] = [
      {
        id: "b1",
        side: "buy",
        money: 100,
        quantity: 100,
        createdAt: new Date("2026-09-01T10:00:00Z"),
      },
      {
        id: "s1",
        side: "sell",
        money: 60,
        quantity: 50,
        createdAt: new Date("2026-09-02T10:00:00Z"),
      },
    ];
    const result = runCostBook(fills);
    expect(result.historyIncomplete).toBe(false);
    expect(result.realized).toHaveLength(1);
    expect(result.realized[0]!.cost).toBe(50); // 50 * 1.0
    expect(result.realized[0]!.pnl).toBe(10);
    expect(result.openLots).toEqual([{ qty: 50, unitPrice: 1 }]);
  });

  it("flags incomplete when sell exceeds buys", () => {
    const fills: PlayerFill[] = [
      {
        id: "s1",
        side: "sell",
        money: 10,
        quantity: 10,
        createdAt: new Date("2026-09-01T10:00:00Z"),
      },
    ];
    const result = runCostBook(fills);
    expect(result.historyIncomplete).toBe(true);
  });
});

describe("sumRealizedPnl", () => {
  it("sums pnl inside window", () => {
    const total = sumRealizedPnl(
      [
        {
          at: new Date("2026-09-01T12:00:00Z"),
          qty: 1,
          proceeds: 2,
          cost: 1,
          pnl: 1,
        },
        {
          at: new Date("2026-08-01T12:00:00Z"),
          qty: 1,
          proceeds: 2,
          cost: 1,
          pnl: 1,
        },
      ],
      new Date("2026-09-01T00:00:00Z"),
      new Date("2026-09-02T00:00:00Z"),
    );
    expect(total).toBe(1);
  });
});
