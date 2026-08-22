import { describe, expect, it, vi } from "vite-plus/test";
import { fetchMuById, fetchMuMembersByMu, parseMuById, parseMuMembers } from "./mu";

const muFixture = {
  _id: "69e5dc36f7b095e977052f7b",
  name: "Sweed Liberty",
  user: "owner1",
  region: "reg1",
  country: "cty1",
  avatarUrl: "https://example.com/a.png",
  mercenaryReputation: 1.2,
  members: ["u1", "u2", "owner1"],
  roles: { managers: ["m1"], commanders: ["u1"] },
  leveling: { level: 1, monthlyDamages: 10 },
  activeUpgradeLevels: { headquarters: 4, dormitories: 5 },
  rankings: {
    muWeeklyDamages: { value: 100, rank: 1, tier: "gold" },
    muBounty: { value: 2.5, rank: 2, tier: "silver" },
    muReputation: { value: 1.2, rank: 3, tier: "gold" },
    muDamages: { value: 999, rank: 4, tier: "platinum" },
    muTerrain: { value: 50, rank: 5, tier: "gold" },
    muWealth: { value: 7, rank: 6, tier: "platinum" },
  },
  createdAt: "2026-04-20T07:56:38.148Z",
  updatedAt: "2026-08-03T12:00:58.000Z",
  __v: 0,
  extraNested: { keep: true },
};

describe("parseMuById", () => {
  it("extracts identity, roster, roles, and ranking stats", () => {
    const parsed = parseMuById(muFixture);
    expect(parsed.id).toBe("69e5dc36f7b095e977052f7b");
    expect(parsed.name).toBe("Sweed Liberty");
    expect(parsed.ownerUserId).toBe("owner1");
    expect(parsed.memberUserIds).toEqual(["u1", "u2", "owner1"]);
    expect(parsed.stats.weeklyDamages).toBe(100);
    expect(parsed.stats.bountyRank).toBe(2);
    expect(parsed.stats.levelingMonthlyDamages).toBe(10);
    expect(parsed.level).toBe(1);
    expect(parsed.roles).toEqual({ managers: ["m1"], commanders: ["u1"] });
  });
});

describe("parseMuMembers", () => {
  it("maps member counter rows", () => {
    const rows = parseMuMembers([
      {
        _id: "row1",
        mu: "mu1",
        user: "u1",
        totalDamagesCount: 10,
        monthlyDamagesCount: 2,
        weeklyDamagesCount: 1,
        totalHelpCount: 3,
        monthlyHelpCount: 1,
        weeklyHelpCount: 0,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      memberRowId: "row1",
      muId: "mu1",
      userId: "u1",
      totalDamagesCount: 10,
      weeklyHelpCount: 0,
    });
  });
});

describe("fetch helpers", () => {
  it("calls mu.getById with muId input", async () => {
    const request = vi.fn().mockResolvedValue({ result: { data: muFixture } });
    const parsed = await fetchMuById({ request }, "69e5dc36f7b095e977052f7b");
    expect(request).toHaveBeenCalledWith(expect.stringContaining("mu.getById"));
    expect(parsed.name).toBe("Sweed Liberty");
  });

  it("calls muMember.getByMu without overriding baseUrl", async () => {
    const request = vi.fn().mockResolvedValue({
      result: {
        data: [
          {
            _id: "row1",
            mu: "mu1",
            user: "u1",
            totalDamagesCount: 1,
            monthlyDamagesCount: 0,
            weeklyDamagesCount: 0,
            totalHelpCount: 0,
            monthlyHelpCount: 0,
            weeklyHelpCount: 0,
          },
        ],
      },
    });
    await fetchMuMembersByMu({ request }, "mu1");
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]).toHaveLength(1);
    expect(String(request.mock.calls[0]![0])).toContain("muMember.getByMu");
    expect(request.mock.calls[0]?.[1]).toBeUndefined();
  });
});
