import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  LEGACY_RECENT_ECONOMY_PLAYERS_KEY,
  RECENT_COMPANIES_PLAYERS_KEY,
  loadRecentCompaniesPlayers,
  rememberCompaniesPlayer,
} from "./recentCompaniesPlayers";

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

describe("loadRecentCompaniesPlayers", () => {
  it("returns empty when missing", () => {
    expect(loadRecentCompaniesPlayers()).toEqual([]);
  });

  it("returns empty for bad JSON", () => {
    localStorage.setItem(RECENT_COMPANIES_PLAYERS_KEY, "{not-json");
    expect(loadRecentCompaniesPlayers()).toEqual([]);
  });

  it("returns empty for non-array JSON", () => {
    localStorage.setItem(RECENT_COMPANIES_PLAYERS_KEY, JSON.stringify({ userId: "u1" }));
    expect(loadRecentCompaniesPlayers()).toEqual([]);
  });

  it("filters invalid entries", () => {
    localStorage.setItem(
      RECENT_COMPANIES_PLAYERS_KEY,
      JSON.stringify([
        { userId: "u1", username: "alice" },
        { userId: 1, username: "bad" },
        { userId: "u2" },
        null,
        { userId: "u3", username: "bob" },
      ]),
    );
    expect(loadRecentCompaniesPlayers()).toEqual([
      { userId: "u1", username: "alice" },
      { userId: "u3", username: "bob" },
    ]);
  });

  it("migrates legacy economyRecentPlayers:v1 into the new key", () => {
    const legacy = [{ userId: "u1", username: "alice" }];
    localStorage.setItem(LEGACY_RECENT_ECONOMY_PLAYERS_KEY, JSON.stringify(legacy));
    expect(loadRecentCompaniesPlayers()).toEqual(legacy);
    expect(localStorage.getItem(RECENT_COMPANIES_PLAYERS_KEY)).toBe(JSON.stringify(legacy));
  });

  it("prefers the new key over legacy when both exist", () => {
    localStorage.setItem(
      RECENT_COMPANIES_PLAYERS_KEY,
      JSON.stringify([{ userId: "u2", username: "bob" }]),
    );
    localStorage.setItem(
      LEGACY_RECENT_ECONOMY_PLAYERS_KEY,
      JSON.stringify([{ userId: "u1", username: "alice" }]),
    );
    expect(loadRecentCompaniesPlayers()).toEqual([{ userId: "u2", username: "bob" }]);
  });
});

describe("rememberCompaniesPlayer", () => {
  it("dedupes by userId and keeps a single entry", () => {
    rememberCompaniesPlayer({ userId: "u1", username: "tryy3" });
    rememberCompaniesPlayer({ userId: "u1", username: "tryy3" });
    rememberCompaniesPlayer({ userId: "u1", username: "tryy3" });
    expect(loadRecentCompaniesPlayers()).toEqual([{ userId: "u1", username: "tryy3" }]);
  });

  it("stores the canonical username from the selection", () => {
    // Caller passes API username ("tryy3"), not typed "TrYy3"
    rememberCompaniesPlayer({ userId: "u1", username: "tryy3" });
    expect(loadRecentCompaniesPlayers()[0]?.username).toBe("tryy3");
  });

  it("updates username when re-selecting same userId", () => {
    rememberCompaniesPlayer({ userId: "u1", username: "OldName" });
    rememberCompaniesPlayer({ userId: "u1", username: "NewName" });
    expect(loadRecentCompaniesPlayers()).toEqual([{ userId: "u1", username: "NewName" }]);
  });

  it("moves an existing player to the front (MRU)", () => {
    rememberCompaniesPlayer({ userId: "u1", username: "a" });
    rememberCompaniesPlayer({ userId: "u2", username: "b" });
    rememberCompaniesPlayer({ userId: "u3", username: "c" });
    rememberCompaniesPlayer({ userId: "u1", username: "a" });
    expect(loadRecentCompaniesPlayers().map((p) => p.userId)).toEqual(["u1", "u3", "u2"]);
  });

  it("keeps only the last 5 distinct players", () => {
    for (let i = 1; i <= 6; i++) {
      rememberCompaniesPlayer({ userId: `u${i}`, username: `user${i}` });
    }
    expect(loadRecentCompaniesPlayers().map((p) => p.userId)).toEqual([
      "u6",
      "u5",
      "u4",
      "u3",
      "u2",
    ]);
  });

  it("does not throw when setItem fails", () => {
    const storage = createMemoryStorage();
    storage.setItem = () => {
      throw new Error("quota");
    };
    vi.stubGlobal("localStorage", storage);
    expect(() => rememberCompaniesPlayer({ userId: "u1", username: "a" })).not.toThrow();
    // In-memory next list is still returned even if persist fails
    expect(rememberCompaniesPlayer({ userId: "u1", username: "a" })).toEqual([
      { userId: "u1", username: "a" },
    ]);
  });
});
