import { describe, expect, it } from "vite-plus/test";
import {
  chunkBatchItemsByMaxSlots,
  chunkBatchItemsByMaxUrlLength,
  parseTrpcBatchResponse,
  wareraBatchPath,
} from "./trpc";

describe("wareraBatchPath", () => {
  it("builds comma-joined procedures with batch=1 and indexed inputs", () => {
    const path = wareraBatchPath([
      { procedure: "user.getUserLite", input: { userId: "a" } },
      { procedure: "user.getUserLite", input: { userId: "b" } },
    ]);
    expect(path.startsWith("user.getUserLite,user.getUserLite?")).toBe(true);
    expect(path).toContain("batch=1");
    const inputParam = new URLSearchParams(path.slice(path.indexOf("?") + 1)).get("input");
    expect(JSON.parse(inputParam!)).toEqual({
      0: { userId: "a" },
      1: { userId: "b" },
    });
  });

  it("allows undefined input slots as null in the input record", () => {
    const path = wareraBatchPath([{ procedure: "gameConfig.getDates" }]);
    const inputParam = new URLSearchParams(path.slice(path.indexOf("?") + 1)).get("input");
    expect(JSON.parse(inputParam!)).toEqual({});
  });

  it("uses unindexed input for a single-item batch", () => {
    const path = wareraBatchPath([{ procedure: "mu.getById", input: { muId: "m1" } }]);
    const inputParam = new URLSearchParams(path.slice(path.indexOf("?") + 1)).get("input");
    expect(JSON.parse(inputParam!)).toEqual({ muId: "m1" });
  });
});

describe("parseTrpcBatchResponse", () => {
  it("maps result.data slots to ok", () => {
    expect(
      parseTrpcBatchResponse([
        { result: { data: { username: "Alice" } } },
        { result: { data: { username: "Bob" } } },
      ]),
    ).toEqual([
      { ok: true, data: { username: "Alice" } },
      { ok: true, data: { username: "Bob" } },
    ]);
  });

  it("maps error slots to ok false", () => {
    expect(
      parseTrpcBatchResponse([
        { result: { data: { ok: true } } },
        { error: { message: "NOT_FOUND", data: { code: "NOT_FOUND" } } },
      ]),
    ).toEqual([
      { ok: true, data: { ok: true } },
      { ok: false, error: { message: "NOT_FOUND", data: { code: "NOT_FOUND" } } },
    ]);
  });

  it("treats missing result.data as ok false", () => {
    expect(parseTrpcBatchResponse([{}])).toEqual([{ ok: false, error: {} }]);
  });

  it("accepts a single slot object for 1-item batches", () => {
    expect(parseTrpcBatchResponse({ result: { data: { name: "Sweed Liberty" } } })).toEqual([
      { ok: true, data: { name: "Sweed Liberty" } },
    ]);
  });

  it("throws for non-array, non-slot payloads", () => {
    expect(() => parseTrpcBatchResponse({ foo: "bar" })).toThrow(
      "WarEra batch response is not an array",
    );
  });
});

it("chunkBatchItemsByMaxSlots splits 51 items into 50 + 1", () => {
  const items = Array.from({ length: 51 }, (_, i) => ({
    procedure: "user.getUserLite",
    input: { userId: String(i) },
  }));
  const chunks = chunkBatchItemsByMaxSlots(items, 50);
  expect(chunks).toHaveLength(2);
  expect(chunks[0]).toHaveLength(50);
  expect(chunks[1]).toHaveLength(1);
});

describe("chunkBatchItemsByMaxUrlLength", () => {
  it("keeps items in one chunk when under max", () => {
    const items = [
      { procedure: "user.getUserLite", input: { userId: "a" } },
      { procedure: "user.getUserLite", input: { userId: "b" } },
    ];
    expect(chunkBatchItemsByMaxUrlLength(items, 10_000)).toEqual([items]);
  });

  it("splits when adding the next item would exceed max URL length", () => {
    const items = [
      { procedure: "user.getUserLite", input: { userId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaa" } },
      { procedure: "user.getUserLite", input: { userId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbb" } },
      { procedure: "user.getUserLite", input: { userId: "cccccccccccccccccccccccccccc" } },
    ];
    const firstLen = wareraBatchPath([items[0]!]).length;
    const chunks = chunkBatchItemsByMaxUrlLength(items, firstLen + 10);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toEqual(items);
  });
});
