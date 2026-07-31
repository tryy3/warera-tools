import { describe, expect, it } from "vitest";
import { isCacheFresh } from "./cache";

describe("isCacheFresh", () => {
  it("is fresh inside TTL", () => {
    const fetchedAt = new Date("2026-07-31T12:00:00.000Z");
    const now = new Date("2026-07-31T12:00:30.000Z");
    expect(isCacheFresh(fetchedAt, 60, now)).toBe(true);
  });

  it("is stale after TTL", () => {
    const fetchedAt = new Date("2026-07-31T12:00:00.000Z");
    const now = new Date("2026-07-31T12:02:00.000Z");
    expect(isCacheFresh(fetchedAt, 60, now)).toBe(false);
  });
});
