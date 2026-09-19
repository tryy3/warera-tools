import { describe, expect, it } from "vite-plus/test";
import { d } from "../money/test-helpers";
import type { PlayerFill } from "./chunkFills";
import { runCostBook, sumRealizedPnl } from "./costBook";

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
    expect(result.realized[0]!.cost.toNumber()).toBe(50); // 50 * 1.0
    expect(result.realized[0]!.pnl.toNumber()).toBe(10);
    expect(result.openLots).toHaveLength(1);
    expect(result.openLots[0]!.qty).toBe(50);
    expect(result.openLots[0]!.unitPrice.toNumber()).toBe(1);
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
          proceeds: d(2),
          cost: d(1),
          pnl: d(1),
        },
        {
          at: new Date("2026-08-01T12:00:00Z"),
          qty: 1,
          proceeds: d(2),
          cost: d(1),
          pnl: d(1),
        },
      ],
      new Date("2026-09-01T00:00:00Z"),
      new Date("2026-09-02T00:00:00Z"),
    );
    expect(total.toNumber()).toBe(1);
  });
});
