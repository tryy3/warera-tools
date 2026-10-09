import { describe, expect, it, vi } from "vite-plus/test";
import { fetchDamageRankings, parseRankingPage, type RankingTarget } from "./battle-ranking";

const pageData = (items: unknown[], nextCursor?: string) => ({
  items,
  itemCount: items.length,
  ...(nextCursor ? { nextCursor } : {}),
});
const page = (items: unknown[], nextCursor?: string) => ({
  result: { data: pageData(items, nextCursor) },
});

describe("parseRankingPage", () => {
  it("keeps rank, user, value and the prize code, tolerating unknown keys", () => {
    const parsed = parseRankingPage({
      items: [
        { rank: 1, user: "u1", value: 10, badge: "roundTop1", lootItem: { code: "boots3", x: 1 } },
        { rank: 2, user: "u2", value: 5, extra: true },
      ],
    });
    expect(parsed.rows).toEqual([
      { rank: 1, userId: "u1", value: 10, lootItemCode: "boots3" },
      { rank: 2, userId: "u2", value: 5, lootItemCode: null },
    ]);
    expect(parsed.nextCursor).toBeNull();
  });

  it("drops rows missing rank, user or value", () => {
    const parsed = parseRankingPage({
      items: [{ user: "u1", value: 1 }, { rank: 1, value: 1 }, { rank: 1, user: "u1" }, "x"],
    });
    expect(parsed.rows).toEqual([]);
  });

  it("rejects a non-page payload", () => {
    expect(() => parseRankingPage({ nope: 1 })).toThrow();
  });
});

const round: RankingTarget = { scope: { kind: "round", roundId: "r1" }, side: "defender" };
const battle: RankingTarget = { scope: { kind: "battle", battleId: "b1" }, side: "attacker" };

describe("fetchDamageRankings", () => {
  it("sends required params and follows cursors without batching", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(page([{ rank: 1, user: "a", value: 3 }], "c2"))
      .mockResolvedValueOnce(page([{ rank: 2, user: "b", value: 2 }]));
    const [out] = await fetchDamageRankings({ request }, [round]);
    expect(out!.complete).toBe(true);
    expect(out!.rows.map((r) => r.userId)).toEqual(["a", "b"]);
    const first = new URL(`http://x/${request.mock.calls[0]![0]}`);
    expect(JSON.parse(first.searchParams.get("input")!)).toEqual({
      roundId: "r1",
      dataType: "damage",
      type: "user",
      side: "defender",
      limit: 100,
    });
    const second = new URL(`http://x/${request.mock.calls[1]![0]}`);
    expect(JSON.parse(second.searchParams.get("input")!).cursor).toBe("c2");
  });

  it("walks all targets with one batch per page depth", async () => {
    const requestBatch = vi
      .fn()
      .mockResolvedValueOnce([
        { ok: true, data: pageData([{ rank: 1, user: "a", value: 3 }], "c2") },
        { ok: true, data: pageData([{ rank: 1, user: "z", value: 9 }]) },
      ])
      .mockResolvedValueOnce([{ ok: true, data: pageData([{ rank: 2, user: "b", value: 2 }]) }]);
    const out = await fetchDamageRankings({ request: vi.fn(), requestBatch }, [round, battle]);
    expect(requestBatch).toHaveBeenCalledTimes(2);
    expect(requestBatch.mock.calls[1]![0]).toHaveLength(1);
    expect(requestBatch.mock.calls[1]![0][0].input).toMatchObject({ roundId: "r1", cursor: "c2" });
    expect(out.map((r) => r.rows.map((x) => x.userId))).toEqual([["a", "b"], ["z"]]);
    expect(out.every((r) => r.complete)).toBe(true);
  });

  it("flags only the target that hit the page cap", async () => {
    const requestBatch = vi.fn().mockResolvedValue([
      { ok: true, data: pageData([{ rank: 1, user: "a", value: 1 }], "more") },
      { ok: true, data: pageData([{ rank: 1, user: "z", value: 1 }]) },
    ]);
    const out = await fetchDamageRankings({ request: vi.fn(), requestBatch }, [round, battle], 2);
    expect(out.map((r) => r.complete)).toEqual([false, true]);
    expect(requestBatch).toHaveBeenCalledTimes(2);
  });

  it("throws when a batch slot fails", async () => {
    const requestBatch = vi.fn().mockResolvedValue([{ ok: false, error: {} }]);
    await expect(
      fetchDamageRankings({ request: vi.fn(), requestBatch }, [round]),
    ).rejects.toThrow();
  });
});
