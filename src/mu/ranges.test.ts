import { describe, expect, it } from "vite-plus/test";
import { parseMuHistoryRange, resolveMuHistoryWindow } from "./ranges";

describe("parseMuHistoryRange", () => {
  it("accepts known ranges and defaults to 7d", () => {
    expect(parseMuHistoryRange("24h")).toBe("24h");
    expect(parseMuHistoryRange("this_week")).toBe("this_week");
    expect(parseMuHistoryRange("last_week")).toBe("last_week");
    expect(parseMuHistoryRange(undefined)).toBe("7d");
    expect(parseMuHistoryRange("nope")).toBe("7d");
  });
});

describe("resolveMuHistoryWindow", () => {
  // Thursday 2026-08-20 15:00:00 UTC
  const now = new Date("2026-08-20T15:00:00.000Z");

  it("resolves rolling 24h", () => {
    const w = resolveMuHistoryWindow("24h", now);
    expect(w.from?.toISOString()).toBe("2026-08-19T15:00:00.000Z");
    expect(w.to.toISOString()).toBe(now.toISOString());
  });

  it("resolves this_week Mon 00:00 UTC → now", () => {
    const w = resolveMuHistoryWindow("this_week", now);
    expect(w.from?.toISOString()).toBe("2026-08-17T00:00:00.000Z");
    expect(w.to.toISOString()).toBe(now.toISOString());
  });

  it("resolves last_week previous Mon → Sun end", () => {
    const w = resolveMuHistoryWindow("last_week", now);
    expect(w.from?.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-08-17T00:00:00.000Z");
  });

  it("resolves all with null from", () => {
    const w = resolveMuHistoryWindow("all", now);
    expect(w.from).toBeNull();
    expect(w.to.toISOString()).toBe(now.toISOString());
  });
});
