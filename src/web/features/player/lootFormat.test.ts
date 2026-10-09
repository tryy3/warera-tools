import { describe, expect, it } from "vite-plus/test";
import { formatDamageNeeded, formatTickCountdown, lootLabel } from "./lootFormat";

describe("lootLabel", () => {
  it("combines the rarity name and equipment type", () => {
    expect(lootLabel("purple", "gloves4")).toBe("Elite Gloves");
    expect(lootLabel("green", "gun")).toBe("Reinforced Gun");
  });
});

describe("formatDamageNeeded", () => {
  it("groups thousands and flags already-ahead as waiting for the tick", () => {
    expect(formatDamageNeeded(1801)).toBe("+1 801");
    expect(formatDamageNeeded(0)).toBe("next tick");
  });
});

describe("formatTickCountdown", () => {
  const at = "2026-10-09T15:07:00.000Z";
  const now = Date.parse("2026-10-09T15:05:37.200Z");

  it("counts down as m:ss, rounding up", () => {
    expect(formatTickCountdown(at, now)).toBe("1:23");
  });

  it("shows ticking when overdue and a dash when unknown", () => {
    expect(formatTickCountdown(at, Date.parse(at) + 1)).toBe("ticking");
    expect(formatTickCountdown(null, now)).toBe("—");
  });
});
