import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createFingerprintCache } from "./snapshot-fingerprint-cache";

describe("createFingerprintCache", () => {
  let cache: ReturnType<typeof createFingerprintCache>;
  beforeEach(() => {
    cache = createFingerprintCache();
  });

  it("ensureWarmed loads only missing keys once", async () => {
    const loader = vi.fn(async (missing: string[]) => {
      expect(missing).toEqual(["a", "b"]);
      return new Map([
        ["a", "1"],
        ["b", "2"],
      ]);
    });
    await cache.ensureWarmed(["a", "b", "a"], loader);
    expect(loader).toHaveBeenCalledOnce();
    expect(cache.get("a")).toBe("1");
    await cache.ensureWarmed(["a", "b"], loader);
    expect(loader).toHaveBeenCalledOnce();
  });

  it("set updates fingerprints used for later compares", () => {
    cache.set("u1", "fp-old");
    cache.set("u1", "fp-new");
    expect(cache.get("u1")).toBe("fp-new");
  });

  it("does not insert keys that warm-miss from loader", async () => {
    const loader = vi.fn(async (missing: string[]) => {
      expect(missing).toEqual(["known", "unknown"]);
      return new Map([["known", "fp-known"]]);
    });
    await cache.ensureWarmed(["known", "unknown"], loader);
    expect(cache.get("known")).toBe("fp-known");
    expect(cache.get("unknown")).toBeUndefined();
  });

  it("setMany updates multiple fingerprints", () => {
    cache.setMany([
      ["x", "1"],
      ["y", "2"],
    ]);
    expect(cache.get("x")).toBe("1");
    expect(cache.get("y")).toBe("2");
  });

  it("clear removes all fingerprints", async () => {
    cache.set("k", "v");
    cache.clear();
    expect(cache.get("k")).toBeUndefined();
  });
});
