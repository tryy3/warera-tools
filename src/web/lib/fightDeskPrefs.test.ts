import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  FIGHT_DESK_PREFS_VERSION,
  defaultFightDeskPrefs,
  fightDeskPrefsKey,
  loadFightDeskPrefs,
  saveFightDeskPrefs,
  type FightDeskPrefsV1,
} from "./fightDeskPrefs";

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
  };
}

const MU_ID = "mu-abc";

beforeEach(() => {
  vi.stubGlobal("localStorage", createMemoryStorage());
});

describe("fightDeskPrefsKey", () => {
  it("scopes prefs by muId and schema version", () => {
    expect(fightDeskPrefsKey(MU_ID)).toBe("fightDeskPrefs:v1:mu-abc");
  });
});

describe("defaultFightDeskPrefs", () => {
  it("returns steak food, zero knobs, and empty selection", () => {
    expect(defaultFightDeskPrefs()).toEqual({
      v: FIGHT_DESK_PREFS_VERSION,
      foodId: "steak",
      battleBonus: 0,
      ticks: 0,
      selectedUserIds: [],
      lastPresetId: null,
      expandedUserIds: [],
    } satisfies FightDeskPrefsV1);
  });
});

describe("loadFightDeskPrefs", () => {
  it("returns null when missing", () => {
    expect(loadFightDeskPrefs(MU_ID)).toBeNull();
  });

  it("returns null for bad JSON", () => {
    localStorage.setItem(fightDeskPrefsKey(MU_ID), "{not-json");
    expect(loadFightDeskPrefs(MU_ID)).toBeNull();
  });

  it("returns null when version is wrong", () => {
    localStorage.setItem(
      fightDeskPrefsKey(MU_ID),
      JSON.stringify({ v: 2, foodId: "steak", battleBonus: 0, ticks: 0, selectedUserIds: [] }),
    );
    expect(loadFightDeskPrefs(MU_ID)).toBeNull();
  });

  it("returns null when required fields are missing or wrong type", () => {
    localStorage.setItem(fightDeskPrefsKey(MU_ID), JSON.stringify({ v: 1 }));
    expect(loadFightDeskPrefs(MU_ID)).toBeNull();

    localStorage.setItem(
      fightDeskPrefsKey(MU_ID),
      JSON.stringify({
        v: 1,
        foodId: "steak",
        battleBonus: "0",
        ticks: 0,
        selectedUserIds: [],
        lastPresetId: null,
        expandedUserIds: [],
      }),
    );
    expect(loadFightDeskPrefs(MU_ID)).toBeNull();
  });

  it("filters non-string entries from selectedUserIds and expandedUserIds", () => {
    localStorage.setItem(
      fightDeskPrefsKey(MU_ID),
      JSON.stringify({
        v: 1,
        foodId: "none",
        battleBonus: 0.1,
        ticks: 2,
        selectedUserIds: ["u1", 2, null, "u2"],
        lastPresetId: "pilled",
        expandedUserIds: ["u1", false],
      }),
    );
    expect(loadFightDeskPrefs(MU_ID)).toEqual({
      v: 1,
      foodId: "none",
      battleBonus: 0.1,
      ticks: 2,
      selectedUserIds: ["u1", "u2"],
      lastPresetId: "pilled",
      expandedUserIds: ["u1"],
    });
  });

  it("returns the stored prefs", () => {
    const prefs = {
      v: 1 as const,
      foodId: "steak",
      battleBonus: 0.05,
      ticks: 3,
      selectedUserIds: ["u1"],
      lastPresetId: "ready" as const,
      expandedUserIds: ["u1"],
    };
    localStorage.setItem(fightDeskPrefsKey(MU_ID), JSON.stringify(prefs));
    expect(loadFightDeskPrefs(MU_ID)).toEqual(prefs);
  });

  it("does not read prefs for a different muId", () => {
    localStorage.setItem(
      fightDeskPrefsKey("other-mu"),
      JSON.stringify(defaultFightDeskPrefs()),
    );
    expect(loadFightDeskPrefs(MU_ID)).toBeNull();
  });
});

describe("saveFightDeskPrefs", () => {
  it("persists prefs under the mu-scoped key", () => {
    const prefs = {
      ...defaultFightDeskPrefs(),
      battleBonus: 0.2,
      selectedUserIds: ["u1", "u2"],
      lastPresetId: "pilled_ready" as const,
    };
    saveFightDeskPrefs(MU_ID, prefs);
    expect(localStorage.getItem(fightDeskPrefsKey(MU_ID))).toBe(JSON.stringify(prefs));
    expect(loadFightDeskPrefs(MU_ID)).toEqual(prefs);
  });

  it("overwrites previous prefs for the same muId", () => {
    saveFightDeskPrefs(MU_ID, defaultFightDeskPrefs());
    saveFightDeskPrefs(MU_ID, { ...defaultFightDeskPrefs(), foodId: "none" });
    expect(loadFightDeskPrefs(MU_ID)?.foodId).toBe("none");
  });

  it("does not throw when setItem fails", () => {
    const storage = createMemoryStorage();
    storage.setItem = () => {
      throw new Error("quota");
    };
    vi.stubGlobal("localStorage", storage);
    expect(() => saveFightDeskPrefs(MU_ID, defaultFightDeskPrefs())).not.toThrow();
  });
});
