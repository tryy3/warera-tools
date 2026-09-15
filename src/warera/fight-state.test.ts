import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { parseFightState, toFightPlayerInput } from "./fight-state";

const fixture: unknown = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fight-state.fixture.json", import.meta.url)), "utf8"),
);

describe("parseFightState", () => {
  it("maps verified user fields into fight and display state", () => {
    const parsed = parseFightState(fixture);

    expect(parsed).toMatchObject({
      userId: "fixture-user",
      username: "Fixture Fighter",
      level: 33,
      militaryRankBonus: 0.2275,
      ammoLabel: "lightAmmo",
      pillStatus: "active",
      pillLabel: "cocain",
      skillLevels: {
        health: 5,
        hunger: 4,
        attack: 6,
        criticalChance: 5,
        criticalDamages: 3,
        armor: 4,
        precision: 5,
        dodge: 5,
      },
    });
    expect(parsed?.pillEndsAt?.toISOString()).toBe("2026-09-15T17:41:22.479Z");
    expect(parsed?.lastSkillsResetAt?.toISOString()).toBe("2026-09-06T11:07:20.190Z");
  });

  it("maps combat totals, bars, and percentage units", () => {
    const parsed = parseFightState(fixture);

    expect(parsed && toFightPlayerInput(parsed)).toEqual({
      userId: "fixture-user",
      atk: 782,
      precision: 0.9,
      critChance: 0.52,
      critDamage: 1.99,
      armor: 68,
      dodge: 35,
      hp: 0.5,
      maxHp: 150,
      hunger: 0.8,
      maxHunger: 8,
      hpRegenPerHour: 15,
      hungerRegenPerHour: 0.8,
      pillStatus: "active",
    });
  });

  it("uses the verified attack debuff percentage as the pill cooldown signal", () => {
    const raw = structuredClone(fixture) as {
      skills: { attack: { buffsPercent: number; debuffsPercent: number } };
      buffs?: unknown;
    };
    raw.skills.attack.buffsPercent = 0;
    raw.skills.attack.debuffsPercent = 30;
    delete raw.buffs;

    expect(parseFightState(raw)?.pillStatus).toBe("debuff");
  });

  it("returns null when required fight fields are absent", () => {
    expect(parseFightState({ _id: "incomplete" })).toBeNull();
  });
});
