import { describe, expect, it, vi } from "vite-plus/test";
import { fetchDamageRanking, parseRankingPage } from "./battle-ranking";

const page = (items: unknown[], nextCursor?: string) => ({
  result: { data: { items, itemCount: items.length, ...(nextCursor ? { nextCursor } : {}) } },
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

describe("fetchDamageRanking", () => {
  it("sends required params and follows cursors", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(page([{ rank: 1, user: "a", value: 3 }], "c2"))
      .mockResolvedValueOnce(page([{ rank: 2, user: "b", value: 2 }]));
    const out = await fetchDamageRanking({ request }, { kind: "round", roundId: "r1" }, "defender");
    expect(out.complete).toBe(true);
    expect(out.rows.map((r) => r.userId)).toEqual(["a", "b"]);
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

  it("flags an incomplete walk at the page cap", async () => {
    const request = vi.fn().mockResolvedValue(page([{ rank: 1, user: "a", value: 1 }], "more"));
    const out = await fetchDamageRanking(
      { request },
      { kind: "battle", battleId: "b1" },
      "attacker",
      2,
    );
    expect(out.complete).toBe(false);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
