import { afterEach, describe, expect, it } from "vite-plus/test";
import { resetMetricsForTests, setMetricsBackend } from "../metrics";
import { createRecordingBackend } from "../metrics/recording";
import { classifyCacheLookup, isCacheFresh, recordCacheLookup } from "./cache";

afterEach(() => {
  resetMetricsForTests();
});

describe("classifyCacheLookup", () => {
  it("distinguishes miss/stale/hit", () => {
    const now = new Date("2026-07-31T12:01:00.000Z");
    expect(classifyCacheLookup(null, now)).toBe("miss");
    expect(
      classifyCacheLookup({ fetchedAt: new Date("2026-07-31T12:00:00.000Z"), ttlSeconds: 30 }, now),
    ).toBe("stale");
    expect(
      classifyCacheLookup({ fetchedAt: new Date("2026-07-31T12:00:00.000Z"), ttlSeconds: 120 }, now),
    ).toBe("hit");
  });
});

describe("recordCacheLookup", () => {
  it("emits cache.l1.lookup", () => {
    const rec = createRecordingBackend();
    setMetricsBackend(rec);
    recordCacheLookup("kv", "hit");
    expect(rec.events).toEqual([
      { type: "count", name: "cache.l1.lookup", value: 1, attrs: { cache_kind: "kv", result: "hit" } },
    ]);
  });
});

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
