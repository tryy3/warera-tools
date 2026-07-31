import { describe, expect, it } from "vite-plus/test";
import { INTERRUPTED_MESSAGE, isStaleRunning } from "./runner";

describe("isStaleRunning", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");

  it("treats missing lastStartedAt as stale", () => {
    expect(isStaleRunning(null, now)).toBe(true);
    expect(isStaleRunning(undefined, now)).toBe(true);
  });

  it("is not stale within 30 minutes", () => {
    const started = new Date(now.getTime() - 29 * 60 * 1000);
    expect(isStaleRunning(started, now)).toBe(false);
  });

  it("is stale after 30 minutes", () => {
    const started = new Date(now.getTime() - 30 * 60 * 1000 - 1);
    expect(isStaleRunning(started, now)).toBe(true);
  });
});

describe("INTERRUPTED_MESSAGE", () => {
  it("uses a stable interrupted/stale label", () => {
    expect(INTERRUPTED_MESSAGE).toBe("interrupted/stale");
  });
});
