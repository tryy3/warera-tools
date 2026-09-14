import { describe, expect, it } from "vite-plus/test";
import { quoteBatch, quoteItem, type QuoteTx } from "./quote";

const hour = 3_600_000;
const now = 1_000_000_000_000;

function tx(money: number, ageMs: number, skills: Record<string, number> = {}): QuoteTx {
  return { money, createdAtMs: now - ageMs, skills };
}

describe("quoteItem", () => {
  it("uses 24h median when >=10 exact matches", () => {
    const txs = Array.from({ length: 10 }, (_, i) => tx(10 + i, i * hour, { attack: 90 }));
    const result = quoteItem({
      itemCode: "sniper",
      skills: { attack: 90 },
      txs,
      nowMs: now,
    });

    expect(result.window).toBe("24h");
    expect(result.widened).toBe(false);
    expect(result.trades).toBe(10);
    expect(result.median).toBe(14.5);
  });

  it("falls back to the 10 newest exact matches when 24h is thin", () => {
    const txs = [
      ...Array.from({ length: 3 }, (_, i) => tx(100, i * hour, { attack: 90 })),
      ...Array.from({ length: 10 }, (_, i) => tx(50, (30 + i) * hour, { attack: 90 })),
    ];
    const result = quoteItem({
      itemCode: "sniper",
      skills: { attack: 90 },
      txs,
      nowMs: now,
    });

    expect(result.window).toBe("last10");
    expect(result.trades).toBe(10);
    expect(result.median).toBe(50);
  });

  it("widens to ±1 when exact matches are thin", () => {
    const txs = Array.from({ length: 10 }, (_, i) => tx(20, (30 + i) * hour, { attack: 91 }));
    const result = quoteItem({
      itemCode: "sniper",
      skills: { attack: 90 },
      txs,
      nowMs: now,
    });

    expect(result.widened).toBe(true);
    expect(result.window).toBe("last10");
    expect(result.trades).toBe(10);
    expect(result.median).toBe(20);
  });

  it("uses all widened matches for a thin quote", () => {
    const result = quoteItem({
      itemCode: "sniper",
      skills: { attack: 90 },
      txs: [tx(12, 30 * hour, { attack: 90 }), tx(18, 31 * hour, { attack: 91 })],
      nowMs: now,
    });

    expect(result).toEqual({
      median: 15,
      trades: 2,
      window: "thin",
      widened: true,
    });
  });

  it("quotes consumables without skills", () => {
    const txs = Array.from({ length: 10 }, (_, i) => tx(1 + i * 0.1, i * hour));
    const result = quoteItem({
      itemCode: "ammo",
      skills: null,
      txs,
      nowMs: now,
    });

    expect(result.widened).toBe(false);
    expect(result.window).toBe("24h");
    expect(result.trades).toBe(10);
    expect(result.median).toBeCloseTo(1.45);
  });

  it("returns an empty thin quote when no transactions match", () => {
    const result = quoteItem({
      itemCode: "sniper",
      skills: { attack: 90 },
      txs: [],
      nowMs: now,
    });

    expect(result).toEqual({
      median: null,
      trades: 0,
      window: "thin",
      widened: true,
    });
  });
});

describe("quoteBatch", () => {
  it("preserves ids and quotes transactions by item code", () => {
    const items = [
      { id: "ammo-1", itemCode: "ammo", skills: null },
      { id: "ammo-2", itemCode: "missing", skills: null },
    ];
    const txsByCode = new Map([["ammo", [tx(2, hour)]]]);

    expect(quoteBatch(items, txsByCode, now)).toEqual([
      {
        id: "ammo-1",
        median: 2,
        trades: 1,
        window: "thin",
        widened: false,
      },
      {
        id: "ammo-2",
        median: null,
        trades: 0,
        window: "thin",
        widened: false,
      },
    ]);
  });
});
