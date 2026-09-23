import { describe, expect, it } from "vite-plus/test";
import { FIGHT_FOOD_OPTIONS, foodBonusForId } from "./food";

describe("fight food", () => {
  it("exposes the frozen v1 food catalog", () => {
    expect(FIGHT_FOOD_OPTIONS).toEqual([
      { id: "none", label: "None", bonus: 0 },
      { id: "steak", label: "Steak (+15%)", bonus: 0.15 },
    ]);
  });

  it("returns the configured bonus for a food id", () => {
    expect(foodBonusForId("none")).toBe(0);
    expect(foodBonusForId("steak")).toBe(0.15);
  });
});
