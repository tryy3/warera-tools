import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { emptyLoadout } from "@/battle-build/slots";
import { SlotCard } from "./SlotCard";
import { buildLoadoutQuoteItems, createLoadoutItem, sumLoadoutQuotes } from "./useLoadoutQuotes";

describe("createLoadoutItem", () => {
  it("adds the expected editable skill for gear and no skills for supplies", () => {
    expect(createLoadoutItem("weapon", "rifle")).toEqual({
      itemCode: "rifle",
      skills: { attack: 0 },
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
