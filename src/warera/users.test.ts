import { describe, expect, it, vi } from "vite-plus/test";
import {
  fetchUserById,
  fetchUserLite,
  fetchUserLiteBatch,
  parseUserByIdCompany,
  parseUserLiteSkills,
} from "./users";

describe("parseUserLiteSkills", () => {
  it("parses getUserLite leveling and skill levels/values", () => {
    const parsed = parseUserLiteSkills({
      _id: "user-1",
      username: "Alice",
      leveling: {
        level: 4,
        availableSkillPoints: 1,
        spentSkillPoints: 15,
        totalSkillPoints: 16,
      },
      skills: {
        energy: { level: 2, value: 50, total: 50 },
        entrepreneurship: { level: 2, value: 40, total: 40 },
        production: { level: 3, value: 19, total: 19 },
        lootChance: { level: 2, value: 9, total: 9 },
        armor: { level: 0, value: null, total: 18 },
      },
    });
    expect(parsed).toEqual({
      userId: "user-1",
      username: "Alice",
      leveling: {
        level: 4,
        availableSkillPoints: 1,
        spentSkillPoints: 15,
        totalSkillPoints: 16,
      },
      skillLevels: {
        energy: 2,
        entrepreneurship: 2,
        production: 3,
        lootChance: 2,
        armor: 0,
      },
      skillValues: {
        energy: 50,
        entrepreneurship: 40,
        production: 19,
        lootChance: 9,
        armor: 18,
      },
    });
  });

  it("falls back username/id and defaults leveling numbers", () => {
    expect(parseUserLiteSkills({ id: "u2", skills: {} })).toEqual({
      userId: "u2",
      username: "u2",
      leveling: {
        level: 0,
        availableSkillPoints: 0,
        spentSkillPoints: 0,
        totalSkillPoints: 0,
      },
      skillLevels: {},
      skillValues: {},
    });
  });
});

describe("parseUserByIdCompany", () => {
  it("reads company string id", () => {
    expect(parseUserByIdCompany({ company: "co-1" })).toEqual({ companyId: "co-1" });
  });

  it("reads nested company object", () => {
    expect(parseUserByIdCompany({ company: { _id: "co-2" } })).toEqual({ companyId: "co-2" });
  });

  it("returns null company when missing", () => {
    expect(parseUserByIdCompany({})).toEqual({ companyId: null });
  });
});

describe("fetchUserLite / fetchUserById", () => {
  it("calls user.getUserLite and unwraps", async () => {
    const request = vi.fn(async () => ({
      result: {
        data: {
          _id: "user-1",
          username: "Alice",
          leveling: {
            level: 1,
            availableSkillPoints: 0,
            spentSkillPoints: 0,
            totalSkillPoints: 0,
          },
          skills: { energy: { level: 1, value: 40, total: 40 } },
        },
      },
    }));
    const lite = await fetchUserLite({ request } as never, "user-1");
    expect(request).toHaveBeenCalledWith(expect.stringContaining("user.getUserLite"));
    expect(lite.skillLevels.energy).toBe(1);
  });

  it("calls user.getUserById and unwraps company", async () => {
    const request = vi.fn(async () => ({
      result: { data: { _id: "user-1", company: "co-9" } },
    }));
    const row = await fetchUserById({ request } as never, "user-1");
    expect(request).toHaveBeenCalledWith(expect.stringContaining("user.getUserById"));
    expect(row).toEqual({ companyId: "co-9" });
  });
});

describe("fetchUserLiteBatch", () => {
  it("dedupes ids and maps ok / failed slots", async () => {
    const requestBatch = vi.fn(async () => [
      {
        ok: true as const,
        data: {
          _id: "u1",
          username: "Alice",
          leveling: {
            level: 1,
            availableSkillPoints: 0,
            spentSkillPoints: 0,
            totalSkillPoints: 0,
          },
          skills: { energy: { level: 4, total: 70 }, production: { level: 6, total: 25 } },
        },
      },
      { ok: false as const, error: { message: "NOT_FOUND" } },
    ]);

    const map = await fetchUserLiteBatch({ request: vi.fn(), requestBatch } as never, [
      "u1",
      "u2",
      "u1",
    ]);

    expect(requestBatch).toHaveBeenCalledTimes(1);
    expect(requestBatch.mock.calls[0]![0]).toHaveLength(2);
    expect(map.get("u1")?.username).toBe("Alice");
    expect(map.get("u1")?.skillLevels.energy).toBe(4);
    expect(map.get("u1")?.skillLevels.production).toBe(6);
    expect(map.get("u2")).toBeNull();
  });

  it("marks all ids null when requestBatch throws", async () => {
    const requestBatch = vi.fn(async () => {
      throw new Error("batch down");
    });
    const map = await fetchUserLiteBatch({ request: vi.fn(), requestBatch } as never, ["a", "b"]);
    expect(map.get("a")).toBeNull();
    expect(map.get("b")).toBeNull();
  });

  it("throws when requestBatch is missing", async () => {
    await expect(fetchUserLiteBatch({ request: vi.fn() } as never, ["u1"])).rejects.toThrow(
      /requestBatch/,
    );
  });
});
