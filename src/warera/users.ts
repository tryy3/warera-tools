import type { WareraRequester } from "./prices";
import { unwrapTrpcData, wareraProcedurePath } from "./trpc";

export type UserLiteSkills = {
  userId: string;
  username: string;
  leveling: {
    level: number;
    availableSkillPoints: number;
    spentSkillPoints: number;
    totalSkillPoints: number;
  };
  skillLevels: Record<string, number>;
  skillValues: Record<string, number>;
};

export type UserCompanyRef = {
  companyId: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function pickFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function parseUserLiteSkills(raw: unknown): UserLiteSkills {
  const obj = asRecord(raw) ?? {};
  const userId = pickString(obj, ["_id", "id", "userId"]) ?? "unknown";
  const username = pickString(obj, ["username", "name"]) ?? userId;
  const levelingObj = asRecord(obj.leveling) ?? {};

  const skillLevels: Record<string, number> = {};
  const skillValues: Record<string, number> = {};
  const skills = asRecord(obj.skills) ?? {};
  for (const [key, skillRaw] of Object.entries(skills)) {
    const skill = asRecord(skillRaw);
    if (!skill) continue;
    const level = skill.level;
    if (typeof level === "number" && Number.isFinite(level)) {
      skillLevels[key] = level;
    }
    const value =
      (typeof skill.total === "number" && Number.isFinite(skill.total) ? skill.total : null) ??
      (typeof skill.value === "number" && Number.isFinite(skill.value) ? skill.value : null);
    if (value != null) skillValues[key] = value;
  }

  return {
    userId,
    username,
    leveling: {
      level: pickFiniteNumber(levelingObj.level),
      availableSkillPoints: pickFiniteNumber(levelingObj.availableSkillPoints),
      spentSkillPoints: pickFiniteNumber(levelingObj.spentSkillPoints),
      totalSkillPoints: pickFiniteNumber(levelingObj.totalSkillPoints),
    },
    skillLevels,
    skillValues,
  };
}

export function parseUserByIdCompany(raw: unknown): UserCompanyRef {
  const obj = asRecord(raw);
  if (!obj) return { companyId: null };

  const direct = pickString(obj, ["companyId", "company"]);
  if (direct) return { companyId: direct };

  const nested = asRecord(obj.company);
  if (nested) {
    const id = pickString(nested, ["_id", "id", "companyId"]);
    if (id) return { companyId: id };
  }

  return { companyId: null };
}

export async function fetchUserLite(
  warera: WareraRequester,
  userId: string,
): Promise<UserLiteSkills> {
  const json = await warera.request<unknown>(wareraProcedurePath("user.getUserLite", { userId }));
  return parseUserLiteSkills(unwrapTrpcData(json));
}

/**
 * Batch-fetch public lite profiles. Dedupes ids. Failed / missing slots → null.
 * Requires `warera.requestBatch` (production client always has it).
 */
export async function fetchUserLiteBatch(
  warera: WareraRequester,
  userIds: string[],
): Promise<Map<string, UserLiteSkills | null>> {
  const unique = [...new Set(userIds.filter((id) => id.length > 0))];
  const out = new Map<string, UserLiteSkills | null>();
  if (unique.length === 0) return out;

  if (!warera.requestBatch) {
    throw new Error("fetchUserLiteBatch requires warera.requestBatch");
  }

  try {
    const slots = await warera.requestBatch(
      unique.map((userId) => ({
        procedure: "user.getUserLite",
        input: { userId },
      })),
    );
    for (let i = 0; i < unique.length; i++) {
      const userId = unique[i]!;
      const slot = slots[i];
      if (!slot?.ok) {
        out.set(userId, null);
        continue;
      }
      try {
        out.set(userId, parseUserLiteSkills(slot.data));
      } catch {
        out.set(userId, null);
      }
    }
  } catch {
    for (const userId of unique) {
      out.set(userId, null);
    }
  }

  return out;
}

export async function fetchUserById(
  warera: WareraRequester,
  userId: string,
): Promise<UserCompanyRef> {
  const json = await warera.request<unknown>(wareraProcedurePath("user.getUserById", { userId }));
  return parseUserByIdCompany(unwrapTrpcData(json));
}
