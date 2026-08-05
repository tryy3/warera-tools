import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  EQUIPMENT_PREFS_KEY,
  loadEquipmentCountryId,
  saveEquipmentCountryId,
} from "./equipmentPrefs";

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

describe("EQUIPMENT_PREFS_KEY", () => {
  it("uses the Equipment-specific v1 key", () => {
    expect(EQUIPMENT_PREFS_KEY).toBe("equipmentPrefs:v1");
  });
});

describe("loadEquipmentCountryId", () => {
  it("returns null when missing", () => {
    expect(loadEquipmentCountryId()).toBeNull();
  });

  it("returns null for bad JSON", () => {
    localStorage.setItem(EQUIPMENT_PREFS_KEY, "{not-json");
    expect(loadEquipmentCountryId()).toBeNull();
  });

  it("returns null when countryId is missing or not a string", () => {
    localStorage.setItem(EQUIPMENT_PREFS_KEY, JSON.stringify({}));
    expect(loadEquipmentCountryId()).toBeNull();

    localStorage.setItem(EQUIPMENT_PREFS_KEY, JSON.stringify({ countryId: 1 }));
    expect(loadEquipmentCountryId()).toBeNull();
  });

  it("returns the stored countryId", () => {
    localStorage.setItem(EQUIPMENT_PREFS_KEY, JSON.stringify({ countryId: "se" }));
    expect(loadEquipmentCountryId()).toBe("se");
  });

  it("does not read Calculator storage keys", () => {
    localStorage.setItem("calculatorPrefs:v1", JSON.stringify({ countryId: "us" }));
    localStorage.setItem("calculatorCountryId", "us");
    expect(loadEquipmentCountryId()).toBeNull();
  });
});

describe("saveEquipmentCountryId", () => {
  it("persists countryId under EQUIPMENT_PREFS_KEY", () => {
    saveEquipmentCountryId("se");
    expect(localStorage.getItem(EQUIPMENT_PREFS_KEY)).toBe(JSON.stringify({ countryId: "se" }));
    expect(loadEquipmentCountryId()).toBe("se");
  });

  it("overwrites previous countryId", () => {
    saveEquipmentCountryId("se");
    saveEquipmentCountryId("us");
    expect(loadEquipmentCountryId()).toBe("us");
  });

  it("does not throw when setItem fails", () => {
    const storage = createMemoryStorage();
    storage.setItem = () => {
      throw new Error("quota");
    };
    vi.stubGlobal("localStorage", storage);
    expect(() => saveEquipmentCountryId("se")).not.toThrow();
  });
});
