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
});
