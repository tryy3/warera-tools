import { describe, expect, it } from "vite-plus/test";
import { median } from "./median";

describe("median", () => {
  it("returns null for empty", () => {
    expect(median([])).toBeNull();
  });

  it("handles odd and even lengths", () => {
    expect(median([3])).toBe(3);
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("does not mutate input", () => {
    const v = [3, 1];
    median(v);
    expect(v).toEqual([3, 1]);
  });
});
