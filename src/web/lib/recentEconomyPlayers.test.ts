import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  RECENT_ECONOMY_PLAYERS_KEY,
  loadRecentEconomyPlayers,
  rememberEconomyPlayer,
} from "./recentEconomyPlayers";

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

describe("loadRecentEconomyPlayers", () => {
  it("returns empty when missing", () => {
    expect(loadRecentEconomyPlayers()).toEqual([]);
  });

  it("returns empty for bad JSON", () => {
    localStorage.setItem(RECENT_ECONOMY_PLAYERS_KEY, "{not-json");
    expect(loadRecentEconomyPlayers()).toEqual([]);
  });

  it("returns empty for non-array JSON", () => {
    localStorage.setItem(RECENT_ECONOMY_PLAYERS_KEY, JSON.stringify({ userId: "u1" }));
    expect(loadRecentEconomyPlayers()).toEqual([]);
  });

  it("filters invalid entries", () => {
    localStorage.setItem(
      RECENT_ECONOMY_PLAYERS_KEY,
      JSON.stringify([
        { userId: "u1", username: "alice" },
        { userId: 1, username: "bad" },
        { userId: "u2" },
        null,
        { userId: "u3", username: "bob" },
      ]),
    );
    expect(loadRecentEconomyPlayers()).toEqual([
      { userId: "u1", username: "alice" },
      { userId: "u3", username: "bob" },
    ]);
  });
});

describe("rememberEconomyPlayer", () => {
  it("dedupes by userId and keeps a single entry", () => {
    rememberEconomyPlayer({ userId: "u1", username: "tryy3" });
    rememberEconomyPlayer({ userId: "u1", username: "tryy3" });
    rememberEconomyPlayer({ userId: "u1", username: "tryy3" });
    expect(loadRecentEconomyPlayers()).toEqual([{ userId: "u1", username: "tryy3" }]);
  });

  it("stores the canonical username from the selection", () => {
    // Caller passes API username ("tryy3"), not typed "TrYy3"
    rememberEconomyPlayer({ userId: "u1", username: "tryy3" });
    expect(loadRecentEconomyPlayers()[0]?.username).toBe("tryy3");
  });

  it("updates username when re-selecting same userId", () => {
    rememberEconomyPlayer({ userId: "u1", username: "OldName" });
    rememberEconomyPlayer({ userId: "u1", username: "NewName" });
    expect(loadRecentEconomyPlayers()).toEqual([{ userId: "u1", username: "NewName" }]);
  });

  it("moves an existing player to the front (MRU)", () => {
    rememberEconomyPlayer({ userId: "u1", username: "a" });
    rememberEconomyPlayer({ userId: "u2", username: "b" });
    rememberEconomyPlayer({ userId: "u3", username: "c" });
    rememberEconomyPlayer({ userId: "u1", username: "a" });
    expect(loadRecentEconomyPlayers().map((p) => p.userId)).toEqual(["u1", "u3", "u2"]);
  });

  it("keeps only the last 5 distinct players", () => {
    for (let i = 1; i <= 6; i++) {
      rememberEconomyPlayer({ userId: `u${i}`, username: `user${i}` });
    }
    expect(loadRecentEconomyPlayers().map((p) => p.userId)).toEqual([
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
    expect(() => rememberEconomyPlayer({ userId: "u1", username: "a" })).not.toThrow();
    // In-memory next list is still returned even if persist fails
    expect(rememberEconomyPlayer({ userId: "u1", username: "a" })).toEqual([
      { userId: "u1", username: "a" },
    ]);
  });
});
