import { describe, expect, it } from "vite-plus/test";
import { listingPrice, priceBounds } from "./listing-price";

describe("listingPrice", () => {
  it("does not average a cheap fill with a fair sale", () => {
    // 24h rifle 80/15 before the latest prints: (12.2 + 15) / 2 = 13.6
    expect(listingPrice([12.2, 15])!.toNumber()).toBe(15);
  });

  it("drops one cheap fill and keeps the cluster median", () => {
    expect(listingPrice([12.2, 15, 15.3, 15.7])!.toNumber()).toBe(15.3);
  });

  it("drops an isolated overpay", () => {
    expect(listingPrice([13, 13.2, 23])!.toNumber()).toBe(13.1);
  });

  it("keeps a tight spread as a plain median", () => {
    expect(listingPrice([15, 15.3, 15.7])!.toNumber()).toBe(15.3);
  });

  it("keeps a real step down once more than one sale prints there", () => {
    expect(listingPrice([12.3, 12.4, 12.5, 15, 15])!.toNumber()).toBe(12.5);
  });

  it("returns null for no sales", () => {
    expect(listingPrice([])).toBeNull();
  });
});

describe("priceBounds", () => {
  it("returns low and high", () => {
    const bounds = priceBounds([15, 12.2, 15.7]);
    expect(bounds.low!.toNumber()).toBe(12.2);
    expect(bounds.high!.toNumber()).toBe(15.7);
  });
});
