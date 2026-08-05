import { describe, expect, it } from "vite-plus/test";
import { tierFromItemCode } from "./catalog";

describe("tierFromItemCode", () => {
  it("maps trailing 1–6 to gray…red", () => {
    expect(tierFromItemCode("chest1")).toBe("gray");
    expect(tierFromItemCode("helmet4")).toBe("purple");
    expect(tierFromItemCode("boots6")).toBe("red");
  });

  it("uses overrides for known weapon codes", () => {
    // sniper has no digit; override table must include it once confirmed — start as null unless override set
    expect(tierFromItemCode("sniper")).toBeNull();
  });

  it("returns null for unknown / bad suffix", () => {
    expect(tierFromItemCode("chest0")).toBeNull();
    expect(tierFromItemCode("chest7")).toBeNull();
    expect(tierFromItemCode("")).toBeNull();
  });
});
