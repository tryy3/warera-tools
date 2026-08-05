import { describe, expect, it } from "vite-plus/test";
import type { ItemMarketTxRow } from "../db/item-market-tx-read";
import { buildEquipmentDetail } from "./detail";
import { MARKET_WINDOW_MS, TREND_LOOKBACK_MS } from "./windows";

const NOW = Date.parse("2026-08-05T12:00:00.000Z");

function tx(
  overrides: Partial<ItemMarketTxRow> & Pick<ItemMarketTxRow, "id" | "money">,
): ItemMarketTxRow {
  return {
    itemCode: "chest4",
    skills: { armor: 22 },
    createdAt: new Date(NOW - 60_000),
    ...overrides,
  };
}

describe("buildEquipmentDetail", () => {
  it("defaults active bands to lowestObserved ±1 and computes triad + recommend", () => {
    const scrapPrice = 0.2;
    const taxRate = 0.01;
    const detail = buildEquipmentDetail({
      itemCode: "chest4",
      txs: [
        tx({ id: "a", money: 40, skills: { armor: 22 }, createdAt: new Date(NOW - 60_000) }),
        tx({ id: "b", money: 50, skills: { armor: 24 }, createdAt: new Date(NOW - 30_000) }),
        tx({ id: "c", money: 60, skills: { armor: 30 }, createdAt: new Date(NOW - 10_000) }),
      ],
      scrapPrice,
      taxRate,
      countryId: "sweden",
      skills: null,
      now: NOW,
    });

    expect(detail.itemCode).toBe("chest4");
    expect(detail.tier).toBe("purple");
    expect(detail.scrapPrice).toBe(0.2);
    expect(detail.taxRate).toBe(0.01);
    expect(detail.countryId).toBe("sweden");
    expect(detail.lowestObserved).toEqual({ armor: 22 });
    expect(detail.skillKeys).toEqual(["armor"]);
    expect(detail.activeBands).toEqual([{ key: "armor", target: 22, band: 1 }]);
    // Only armor 22 (±1) in 24h: id a (40). id b is 24 → out of band.
    expect(detail.marketMedian).toBe(40);
    expect(detail.trades).toBe(1);
    expect(detail.sellerNet).toBeCloseTo(40 / 1.01, 5);
    expect(detail.scrapFloor).toBe(162 * scrapPrice);
    expect(detail.recommend).not.toBeNull();
    expect(detail.recommend!.scrapFloor).toBeCloseTo(32.4, 5);
    expect(detail.recommend!.breakEvenIncl).toBeCloseTo(32.4 * 1.01, 5);
    expect(detail.recommend!.attractiveIncl).toBeCloseTo(32.4 * 1.01 * 1.05, 5);
  });

  it("filters market median by provided skill bands within 24h window", () => {
    const detail = buildEquipmentDetail({
      itemCode: "chest4",
      txs: [
        tx({
          id: "old",
          money: 100,
          skills: { armor: 22 },
          createdAt: new Date(NOW - MARKET_WINDOW_MS - 1),
        }),
        tx({ id: "in", money: 40, skills: { armor: 22 }, createdAt: new Date(NOW - 60_000) }),
        tx({ id: "out", money: 90, skills: { armor: 30 }, createdAt: new Date(NOW - 30_000) }),
      ],
      scrapPrice: 0.2,
      taxRate: 0.01,
      countryId: "sweden",
      skills: [{ key: "armor", target: 22, band: 0 }],
      now: NOW,
    });

    expect(detail.activeBands).toEqual([{ key: "armor", target: 22, band: 0 }]);
    expect(detail.marketMedian).toBe(40);
    expect(detail.trades).toBe(1);
  });

  it("builds dailyMedians over TREND_LOOKBACK with band filter", () => {
    const day0 = Date.parse("2026-08-04T15:00:00.000Z");
    const day1 = Date.parse("2026-08-05T08:00:00.000Z");
    const detail = buildEquipmentDetail({
      itemCode: "chest4",
      txs: [
        tx({ id: "d0a", money: 30, skills: { armor: 22 }, createdAt: new Date(day0) }),
        tx({ id: "d0b", money: 50, skills: { armor: 22 }, createdAt: new Date(day0 + 1000) }),
        tx({ id: "d1", money: 44, skills: { armor: 22 }, createdAt: new Date(day1) }),
        tx({ id: "skip", money: 999, skills: { armor: 40 }, createdAt: new Date(day1) }),
      ],
      scrapPrice: null,
      taxRate: null,
      countryId: null,
      skills: [{ key: "armor", target: 22, band: 0 }],
      now: NOW,
    });

    expect(detail.dailyMedians).toEqual([
      { day: "2026-08-04", median: 40, trades: 2 },
      { day: "2026-08-05", median: 44, trades: 1 },
    ]);
    expect(NOW - TREND_LOOKBACK_MS).toBeLessThan(day0);
  });

  it("builds ladder buckets for the first skill key", () => {
    const detail = buildEquipmentDetail({
      itemCode: "chest4",
      txs: [
        tx({ id: "a", money: 30, skills: { armor: 20 } }),
        tx({ id: "b", money: 40, skills: { armor: 20 } }),
        tx({ id: "c", money: 50, skills: { armor: 22 } }),
        tx({ id: "d", money: 70, skills: { armor: 24 } }),
      ],
      scrapPrice: null,
      taxRate: null,
      countryId: null,
      skills: [{ key: "armor", target: 22, band: 10 }],
      now: NOW,
    });

    expect(detail.ladder).toEqual([
      { bucketLabel: "20", median: 35, trades: 2 },
      { bucketLabel: "22", median: 50, trades: 1 },
      { bucketLabel: "24", median: 70, trades: 1 },
    ]);
  });

  it("multi-skill ladder buckets by skillKeys[0] while AND-matching other bands", () => {
    const detail = buildEquipmentDetail({
      itemCode: "weapon4",
      txs: [
        tx({
          id: "a",
          itemCode: "weapon4",
          money: 100,
          skills: { attack: 88, criticalChance: 13 },
        }),
        tx({
          id: "b",
          itemCode: "weapon4",
          money: 120,
          skills: { attack: 90, criticalChance: 13 },
        }),
        tx({
          id: "c",
          itemCode: "weapon4",
          money: 200,
          skills: { attack: 90, criticalChance: 20 },
        }),
      ],
      scrapPrice: 0.2,
      taxRate: 0.01,
      countryId: "sweden",
      skills: [
        { key: "attack", target: 89, band: 5 },
        { key: "criticalChance", target: 13, band: 0 },
      ],
      now: NOW,
    });

    expect(detail.skillKeys).toEqual(["attack", "criticalChance"]);
    // Other band (criticalChance=13) excludes id c; ladder by attack
    expect(detail.ladder).toEqual([
      { bucketLabel: "88", median: 100, trades: 1 },
      { bucketLabel: "90", median: 120, trades: 1 },
    ]);
  });

  it("nulls sellerNet and recommend when tax or scrap/tier missing", () => {
    const noTax = buildEquipmentDetail({
      itemCode: "chest4",
      txs: [tx({ id: "a", money: 40 })],
      scrapPrice: 0.2,
      taxRate: null,
      countryId: "missing",
      skills: [{ key: "armor", target: 22, band: 1 }],
      now: NOW,
    });
    expect(noTax.sellerNet).toBeNull();
    expect(noTax.recommend).toBeNull();
    expect(noTax.scrapFloor).toBe(32.4);

    const noScrap = buildEquipmentDetail({
      itemCode: "chest4",
      txs: [tx({ id: "a", money: 40 })],
      scrapPrice: null,
      taxRate: 0.01,
      countryId: "sweden",
      skills: [{ key: "armor", target: 22, band: 1 }],
      now: NOW,
    });
    expect(noScrap.scrapFloor).toBeNull();
    expect(noScrap.recommend).toBeNull();
    expect(noScrap.sellerNet).toBeCloseTo(40 / 1.01, 5);

    const unknown = buildEquipmentDetail({
      itemCode: "unknownWeapon",
      txs: [tx({ id: "a", itemCode: "unknownWeapon", money: 100, skills: { attack: 10 } })],
      scrapPrice: 0.2,
      taxRate: 0.01,
      countryId: "sweden",
      skills: [{ key: "attack", target: 10, band: 0 }],
      now: NOW,
    });
    expect(unknown.tier).toBeNull();
    expect(unknown.scrapFloor).toBeNull();
    expect(unknown.recommend).toBeNull();
  });

  it("excludes txs with unparseable skills from band-filtered sets", () => {
    const detail = buildEquipmentDetail({
      itemCode: "chest4",
      txs: [
        tx({ id: "ok", money: 40, skills: { armor: 22 } }),
        tx({ id: "bad", money: 999, skills: { armor: "x" } as unknown as Record<string, unknown> }),
        tx({ id: "null", money: 888, skills: null }),
      ],
      scrapPrice: null,
      taxRate: null,
      countryId: null,
      skills: [{ key: "armor", target: 22, band: 0 }],
      now: NOW,
    });
    expect(detail.marketMedian).toBe(40);
    expect(detail.trades).toBe(1);
    expect(detail.lowestObserved).toEqual({ armor: 22 });
  });
});
