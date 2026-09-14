import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { emptyLoadout } from "@/battle-build/slots";
import { SlotCard } from "./SlotCard";
import {
  buildLoadoutQuoteItems,
  createLoadoutItem,
  scheduleLoadoutQuoteBatch,
  sumLoadoutQuotes,
} from "./useLoadoutQuotes";

describe("createLoadoutItem", () => {
  it("adds the expected editable skill for gear and no skills for supplies", () => {
    expect(createLoadoutItem("weapon", "rifle")).toEqual({
      itemCode: "rifle",
      skills: { attack: 0, criticalChance: 0 },
    });
    expect(createLoadoutItem("gloves", "gloves3")).toEqual({
      itemCode: "gloves3",
      skills: { armor: 0 },
    });
    expect(createLoadoutItem("ammo", "heavyAmmo")).toEqual({
      itemCode: "heavyAmmo",
      skills: {},
    });
  });
});

describe("scheduleLoadoutQuoteBatch", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces rapid loadout changes into one batched request", async () => {
    vi.useFakeTimers();
    const request = vi.fn(async () => []);
    const onSuccess = vi.fn();
    const firstItems = [{ id: "weapon", itemCode: "rifle", skills: { attack: 1 } }];
    const latestItems = [{ id: "weapon", itemCode: "rifle", skills: { attack: 2 } }];

    const cancelFirst = scheduleLoadoutQuoteBatch({
      items: firstItems,
      request,
      onSuccess,
      onError: vi.fn(),
    });
    cancelFirst();
    scheduleLoadoutQuoteBatch({
      items: latestItems,
      request,
      onSuccess,
      onError: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(299);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(latestItems);
  });

  it("ignores a stale response after the scheduled batch is cancelled", async () => {
    vi.useFakeTimers();
    let resolveRequest!: (quotes: []) => void;
    const request = vi.fn(
      () =>
        new Promise<[]>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const onSuccess = vi.fn();
    const cancel = scheduleLoadoutQuoteBatch({
      items: [{ id: "weapon", itemCode: "rifle", skills: { attack: 1 } }],
      request,
      onSuccess,
      onError: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(300);
    expect(request).toHaveBeenCalledTimes(1);
    cancel();
    resolveRequest([]);
    await Promise.resolve();

    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe("buildLoadoutQuoteItems", () => {
  it("quotes only filled slots and treats empty skill maps as unskilled items", () => {
    const loadout = emptyLoadout();
    loadout.weapon = { itemCode: "sniper", skills: { attack: 103 } };
    loadout.food = { itemCode: "steak", skills: {} };

    expect(buildLoadoutQuoteItems(loadout)).toEqual([
      { id: "weapon", itemCode: "sniper", skills: { attack: 103 } },
      { id: "food", itemCode: "steak", skills: null },
    ]);
  });
});

describe("sumLoadoutQuotes", () => {
  it("sums non-null medians", () => {
    expect(
      sumLoadoutQuotes([
        { id: "weapon", median: 12.5, trades: 10, window: "24h", widened: false },
        { id: "helmet", median: null, trades: 0, window: "thin", widened: true },
        { id: "food", median: 2, trades: 4, window: "thin", widened: false },
      ]),
    ).toEqual({ total: 14.5, quotedCount: 2 });
  });
});

describe("SlotCard", () => {
  it("renders thin quote metadata and the widened badge", () => {
    const html = renderToStaticMarkup(
      <SlotCard
        slot="gloves"
        item={{ itemCode: "gloves3", skills: { armor: 20 } }}
        quote={{
          id: "gloves",
          median: 4.5,
          trades: 3,
          window: "thin",
          widened: true,
        }}
        quotePending={false}
        onChange={() => undefined}
      />,
    );

    expect(html).toContain("Gloves");
    expect(html).toContain("Median (tax incl.)");
    expect(html).toContain("thin · 3 trades");
    expect(html).toContain("±1");
  });

  it("does not render a quote line for an empty slot", () => {
    const html = renderToStaticMarkup(
      <SlotCard
        slot="food"
        item={null}
        quote={null}
        quotePending={false}
        onChange={() => undefined}
      />,
    );

    expect(html).toContain("Empty");
    expect(html).not.toContain("Median (tax incl.)");
  });
});
