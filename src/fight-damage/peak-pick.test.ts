import { describe, expect, it } from "vite-plus/test";
import { pickHighestAtkSnapshot } from "./peak-pick";

describe("pickHighestAtkSnapshot", () => {
  it("returns null for an empty list", () => {
    expect(pickHighestAtkSnapshot([])).toBeNull();
  });

  it("picks the highest atk row", () => {
    const rows = [
      { atk: 100, recordedAt: new Date("2026-09-10T00:00:00.000Z"), id: 1 },
      { atk: 250, recordedAt: new Date("2026-09-11T00:00:00.000Z"), id: 2 },
      { atk: 200, recordedAt: new Date("2026-09-12T00:00:00.000Z"), id: 3 },
    ];
    expect(pickHighestAtkSnapshot(rows)?.id).toBe(2);
  });

  it("breaks atk ties with newer recordedAt then higher id", () => {
    const rows = [
      { atk: 300, recordedAt: new Date("2026-09-12T00:00:00.000Z"), id: 1 },
      { atk: 300, recordedAt: new Date("2026-09-12T00:00:00.000Z"), id: 9 },
      { atk: 300, recordedAt: new Date("2026-09-11T00:00:00.000Z"), id: 5 },
    ];
    expect(pickHighestAtkSnapshot(rows)?.id).toBe(9);
  });
});
