import { describe, expect, it } from "vite-plus/test";
import { SKILLS_RESET_COOLDOWN_MS, skillsResetStatus } from "./skills-reset";

describe("skillsResetStatus", () => {
  const now = new Date("2026-03-15T12:00:00.000Z");

  it("returns available when lastSkillsResetAt is null", () => {
    expect(skillsResetStatus(null, now)).toEqual({ kind: "available" });
  });

  it("returns available when cooldown has elapsed", () => {
    const lastReset = new Date(now.getTime() - SKILLS_RESET_COOLDOWN_MS);
    expect(skillsResetStatus(lastReset, now)).toEqual({ kind: "available" });
  });

  it("returns cooldown when inside the window", () => {
    const lastReset = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const status = skillsResetStatus(lastReset, now);

    expect(status.kind).toBe("cooldown");
    if (status.kind !== "cooldown") return;

    const expectedEndsAt = new Date(lastReset.getTime() + SKILLS_RESET_COOLDOWN_MS);
    expect(status.endsAt).toEqual(expectedEndsAt);
    expect(status.remainingMs).toBe(expectedEndsAt.getTime() - now.getTime());
  });
});
