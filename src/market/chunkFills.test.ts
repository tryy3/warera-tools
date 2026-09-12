import { describe, expect, it } from "vitest";
import { chunkFills, type PlayerFill } from "./chunkFills";

function fill(partial: Partial<PlayerFill> & Pick<PlayerFill, "id" | "side" | "money" | "quantity" | "createdAt">): PlayerFill {
  return partial;
}

describe("chunkFills", () => {
  it("merges same price buys within 1h gap", () => {
    const t0 = new Date("2026-09-01T10:00:00Z");
    const t1 = new Date("2026-09-01T10:30:00Z");
    const chunks = chunkFills([
      fill({ id: "1", side: "buy", money: 40, quantity: 1000, createdAt: t0 }),
      fill({ id: "2", side: "buy", money: 20, quantity: 500, createdAt: t1 }),
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.totalQty).toBe(1500);
    expect(chunks[0]!.totalMoney).toBe(60);
    expect(chunks[0]!.fillCount).toBe(2);
    expect(chunks[0]!.unitPrice).toBeCloseTo(60 / 1500, 10);
  });

  it("splits when gap > 1h", () => {
    const chunks = chunkFills([
      fill({
        id: "1",
        side: "buy",
        money: 10,
        quantity: 100,
        createdAt: new Date("2026-09-01T10:00:00Z"),
      }),
      fill({
        id: "2",
        side: "buy",
        money: 10,
        quantity: 100,
        createdAt: new Date("2026-09-01T12:00:01Z"),
      }),
    ]);
    expect(chunks).toHaveLength(2);
  });

  it("splits different unit prices", () => {
    const t0 = new Date("2026-09-01T10:00:00Z");
    const chunks = chunkFills([
      fill({ id: "1", side: "buy", money: 10, quantity: 100, createdAt: t0 }),
      fill({
        id: "2",
        side: "buy",
        money: 12,
        quantity: 100,
        createdAt: new Date("2026-09-01T10:10:00Z"),
      }),
    ]);
    expect(chunks).toHaveLength(2);
  });

  it("does not merge buy with sell", () => {
    const t0 = new Date("2026-09-01T10:00:00Z");
    const chunks = chunkFills([
      fill({ id: "1", side: "buy", money: 10, quantity: 100, createdAt: t0 }),
      fill({
        id: "2",
        side: "sell",
        money: 10,
        quantity: 100,
        createdAt: new Date("2026-09-01T10:10:00Z"),
      }),
    ]);
    expect(chunks).toHaveLength(2);
  });

  it("merges buys across interleaved sell when gap from prior buy <= 1h", () => {
    const t0 = new Date("2026-09-01T10:00:00Z");
    const tSell = new Date("2026-09-01T10:30:00Z");
    const tBuy2 = new Date("2026-09-01T10:45:00Z");
    const price = 0.04;

    const chunks = chunkFills([
      fill({ id: "1", side: "buy", money: 40, quantity: 1000, createdAt: t0 }),
      fill({ id: "2", side: "sell", money: 40, quantity: 1000, createdAt: tSell }),
      fill({ id: "3", side: "buy", money: 20, quantity: 500, createdAt: tBuy2 }),
    ]);

    expect(chunks).toHaveLength(2);

    const buyChunk = chunks.find((chunk) => chunk.side === "buy");
    const sellChunk = chunks.find((chunk) => chunk.side === "sell");

    expect(buyChunk).toBeDefined();
    expect(sellChunk).toBeDefined();
    expect(buyChunk!.totalQty).toBe(1500);
    expect(buyChunk!.totalMoney).toBe(60);
    expect(buyChunk!.fillCount).toBe(2);
    expect(buyChunk!.unitPrice).toBeCloseTo(price, 10);
    expect(sellChunk!.totalQty).toBe(1000);
    expect(sellChunk!.fillCount).toBe(1);
  });
});
