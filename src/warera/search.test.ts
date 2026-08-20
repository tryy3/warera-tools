import { describe, expect, it, vi } from "vite-plus/test";
import { searchMus, searchUsers } from "./search";

function searchAnythingResponse(payload: Record<string, unknown>) {
  return { result: { data: payload } };
}

function inputFromPath(path: string): Record<string, unknown> {
  const match = path.match(/[?&]input=([^&]+)/);
  if (!match) return {};
  try {
    return JSON.parse(decodeURIComponent(match[1] ?? "{}")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function stringInput(path: string, key: string): string {
  const value = inputFromPath(path)[key];
  return typeof value === "string" ? value : "";
}

describe("searchUsers", () => {
  it("resolves userIds via user.getUserLite", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes("search.searchAnything")) {
        return searchAnythingResponse({ userIds: ["u1", "u2"] });
      }
      if (path.includes("user.getUserLite")) {
        const id = stringInput(path, "userId") || "u1";
        return { result: { data: { _id: id, username: `name-${id}` } } };
      }
      throw new Error(`unexpected call: ${path}`);
    });

    const hits = await searchUsers({ request } as never, "ab");
    expect(hits).toEqual([
      { userId: "u1", username: "name-u1" },
      { userId: "u2", username: "name-u2" },
    ]);
  });

  it("falls back to id as username when getUserLite fails", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes("search.searchAnything")) {
        return searchAnythingResponse({ userIds: ["u1"] });
      }
      if (path.includes("user.getUserLite")) {
        throw new Error("lite failed");
      }
      throw new Error(`unexpected call: ${path}`);
    });

    const hits = await searchUsers({ request } as never, "ab");
    expect(hits).toEqual([{ userId: "u1", username: "u1" }]);
  });
});

describe("searchMus", () => {
  it("resolves muIds via mu.getById", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes("search.searchAnything")) {
        return searchAnythingResponse({ muIds: ["m1", "m2"] });
      }
      if (path.includes("mu.getById")) {
        const id = stringInput(path, "muId") || "m1";
        return { result: { data: { _id: id, name: `MU ${id}` } } };
      }
      throw new Error(`unexpected call: ${path}`);
    });

    const hits = await searchMus({ request } as never, "ab");
    expect(hits).toEqual([
      { muId: "m1", name: "MU m1" },
      { muId: "m2", name: "MU m2" },
    ]);
  });

  it("falls back to id as name when getById fails", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes("search.searchAnything")) {
        return searchAnythingResponse({ muIds: ["m1"] });
      }
      if (path.includes("mu.getById")) {
        throw new Error("getById failed");
      }
      throw new Error(`unexpected call: ${path}`);
    });

    const hits = await searchMus({ request } as never, "ab");
    expect(hits).toEqual([{ muId: "m1", name: "m1" }]);
  });

  it("respects the limit argument", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes("search.searchAnything")) {
        return searchAnythingResponse({ muIds: ["m1", "m2", "m3"] });
      }
      if (path.includes("mu.getById")) {
        const id = stringInput(path, "muId") || "m1";
        return { result: { data: { _id: id, name: `MU ${id}` } } };
      }
      throw new Error(`unexpected call: ${path}`);
    });

    const hits = await searchMus({ request } as never, "ab", 2);
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.muId)).toEqual(["m1", "m2"]);
  });

  it("returns empty when muIds is missing or non-array", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes("search.searchAnything")) {
        return searchAnythingResponse({ userIds: ["u1"] });
      }
      throw new Error(`unexpected call: ${path}`);
    });

    const hits = await searchMus({ request } as never, "ab");
    expect(hits).toEqual([]);
    expect(request).not.toHaveBeenCalledWith(
      expect.stringContaining("mu.getById"),
      expect.anything(),
    );
  });

  it("ignores non-string muIds", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes("search.searchAnything")) {
        return searchAnythingResponse({ muIds: ["m1", 123, null, "m2"] });
      }
      if (path.includes("mu.getById")) {
        const id = stringInput(path, "muId") || "m1";
        return { result: { data: { _id: id, name: `MU ${id}` } } };
      }
      throw new Error(`unexpected call: ${path}`);
    });

    const hits = await searchMus({ request } as never, "ab");
    expect(hits.map((h) => h.muId)).toEqual(["m1", "m2"]);
  });
});
