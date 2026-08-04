import { describe, expect, it } from "vite-plus/test";
import { nullsLastSortingFn } from "./nullsLastSortingFn";

type Row = { getValue: (columnId: string) => number | null };

function row(value: number | null): Row {
  return { getValue: () => value };
}

describe("nullsLastSortingFn", () => {
  it("orders finite numbers ascending", () => {
    expect(nullsLastSortingFn(row(1) as never, row(2) as never, "x")).toBeLessThan(0);
    expect(nullsLastSortingFn(row(2) as never, row(1) as never, "x")).toBeGreaterThan(0);
    expect(nullsLastSortingFn(row(1) as never, row(1) as never, "x")).toBe(0);
  });

  it("puts nulls after finite numbers", () => {
    expect(nullsLastSortingFn(row(null) as never, row(1) as never, "x")).toBeGreaterThan(0);
    expect(nullsLastSortingFn(row(1) as never, row(null) as never, "x")).toBeLessThan(0);
    expect(nullsLastSortingFn(row(null) as never, row(null) as never, "x")).toBe(0);
  });

  it("treats non-finite numbers like null", () => {
    expect(nullsLastSortingFn(row(Number.NaN) as never, row(1) as never, "x")).toBeGreaterThan(0);
  });
});
