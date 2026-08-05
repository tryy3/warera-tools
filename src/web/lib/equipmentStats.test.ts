import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  equipmentStatsKey,
  loadStats,
  loadStoredEquipmentStats,
  saveStoredEquipmentStats,
  type StoredEquipmentStats,
} from "./equipmentStats";

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

beforeEach(() => {
  vi.stubGlobal("localStorage", createMemoryStorage());
});

describe("equipmentStatsKey", () => {
  it("builds the per-item Equipment key", () => {
    expect(equipmentStatsKey("weapon_q1")).toBe("equipmentStats:v1:weapon_q1");
  });
});

describe("loadStoredEquipmentStats / saveStoredEquipmentStats", () => {
  it("returns null when missing", () => {
    expect(loadStoredEquipmentStats("weapon_q1")).toBeNull();
  });

  it("returns null for bad JSON", () => {
    localStorage.setItem(equipmentStatsKey("weapon_q1"), "{not-json");
    expect(loadStoredEquipmentStats("weapon_q1")).toBeNull();
  });

  it("returns null for invalid shape", () => {
    localStorage.setItem(equipmentStatsKey("weapon_q1"), JSON.stringify({ targets: [] }));
    expect(loadStoredEquipmentStats("weapon_q1")).toBeNull();

    localStorage.setItem(equipmentStatsKey("weapon_q1"), JSON.stringify(null));
    expect(loadStoredEquipmentStats("weapon_q1")).toBeNull();
  });

  it("round-trips stored stats", () => {
    const stats: StoredEquipmentStats = {
      targets: { armor: 22, attack: 90 },
      bands: { armor: 2 },
    };
    saveStoredEquipmentStats("weapon_q1", stats);
    expect(loadStoredEquipmentStats("weapon_q1")).toEqual(stats);
  });

  it("isolates stats per itemCode", () => {
    saveStoredEquipmentStats("weapon_q1", {
      targets: { attack: 10 },
      bands: { attack: 1 },
    });
    saveStoredEquipmentStats("armor_q2", {
      targets: { armor: 20 },
      bands: { armor: 3 },
    });
    expect(loadStoredEquipmentStats("weapon_q1")?.targets).toEqual({ attack: 10 });
    expect(loadStoredEquipmentStats("armor_q2")?.targets).toEqual({ armor: 20 });
  });

  it("does not throw when setItem fails", () => {
    const storage = createMemoryStorage();
    storage.setItem = () => {
      throw new Error("quota");
    };
    vi.stubGlobal("localStorage", storage);
    expect(() =>
      saveStoredEquipmentStats("weapon_q1", { targets: { a: 1 }, bands: {} }),
    ).not.toThrow();
  });
});

describe("loadStats", () => {
  it("prefers stored targets over lowestObserved", () => {
    saveStoredEquipmentStats("weapon_q1", {
      targets: { armor: 22, attack: 90 },
      bands: { armor: 2 },
    });
    expect(
      loadStats("weapon_q1", {
        armor: 10,
        attack: 50,
      }),
    ).toEqual([
      { key: "armor", target: 22, band: 2 },
      { key: "attack", target: 90, band: 1 },
    ]);
  });

  it("defaults missing band to 1", () => {
    saveStoredEquipmentStats("weapon_q1", {
      targets: { armor: 22 },
      bands: {},
    });
    expect(loadStats("weapon_q1", null)).toEqual([{ key: "armor", target: 22, band: 1 }]);
  });

  it("falls back to lowestObserved with band 1 when no stored targets", () => {
    expect(
      loadStats("weapon_q1", {
        armor: 15,
        criticalChance: 13,
      }),
    ).toEqual([
      { key: "armor", target: 15, band: 1 },
      { key: "criticalChance", target: 13, band: 1 },
    ]);
  });

  it("returns empty when no stored targets and no lowestObserved", () => {
    expect(loadStats("weapon_q1", null)).toEqual([]);
  });

  it("treats empty stored targets as missing and uses lowestObserved", () => {
    saveStoredEquipmentStats("weapon_q1", { targets: {}, bands: { armor: 2 } });
    expect(loadStats("weapon_q1", { armor: 15 })).toEqual([{ key: "armor", target: 15, band: 1 }]);
  });

  it("returns empty on corrupt storage when lowestObserved is null", () => {
    localStorage.setItem(equipmentStatsKey("weapon_q1"), "{broken");
    expect(loadStats("weapon_q1", null)).toEqual([]);
  });
});
