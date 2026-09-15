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

  it("maps a synthetic nonzero debuff percentage without inventing a timer", () => {
    const raw = structuredClone(fixture) as {
      skills: { attack: { buffsPercent: number; debuffsPercent: number } };
    };
    raw.skills.attack.buffsPercent = 0;
    raw.skills.attack.debuffsPercent = 30;

    expect(parseFightState(raw)).toMatchObject({
      pillStatus: "debuff",
      pillLabel: null,
      pillEndsAt: null,
    });
  });

  it("returns null when pill percentage fields are missing or malformed", () => {
    const missing = structuredClone(fixture) as {
      skills: { attack: { buffsPercent?: number; debuffsPercent?: number } };
    };
    delete missing.skills.attack.buffsPercent;
    delete missing.skills.attack.debuffsPercent;

    const malformed = structuredClone(fixture) as {
      skills: { attack: { buffsPercent: unknown; debuffsPercent: unknown } };
    };
    malformed.skills.attack.buffsPercent = "60";
    malformed.skills.attack.debuffsPercent = Number.NaN;

    expect(parseFightState(missing)).toBeNull();
    expect(parseFightState(malformed)).toBeNull();
  });

  it("returns pillLabel only for verified pill buff codes", () => {
    const known = structuredClone(fixture) as {
      buffs: { buffCodes: string[] };
    };
    known.buffs.buffCodes = ["zeta", "cocain", "alpha"];

    const unknown = structuredClone(fixture) as {
      buffs: { buffCodes: string[] };
    };
    unknown.buffs.buffCodes = ["zeta", "alpha"];

    const ready = structuredClone(fixture) as {
      buffs: { buffCodes: string[] };
      skills: { attack: { buffsPercent: number } };
    };
    ready.buffs.buffCodes = ["zeta", "alpha"];
    ready.skills.attack.buffsPercent = 0;

    expect(parseFightState(known)?.pillLabel).toBe("cocain");
    expect(parseFightState(unknown)?.pillLabel).toBeNull();
    expect(parseFightState(ready)?.pillLabel).toBeNull();
  });

  it("returns null when required fight fields are absent", () => {
    expect(parseFightState({ _id: "incomplete" })).toBeNull();
  });
});
