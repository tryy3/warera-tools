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

export type UserByIdRef = {
  userId: string;
  username: string | null;
  companyId: string | null;
  muId: string | null;
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

/**
 * Parse a `user.getUserById` payload into a flat ref.
 *
 * Throws when no valid id is present — callers must not persist/reconcile a
 * placeholder `"unknown"` id. Field aliases probed:
 *   - userId: `_id` / `id` / `userId`
 *   - username: `username` / `name`
 *   - companyId: direct `companyId` / `company` string, or nested `company.{_id,id,companyId}`
 *   - muId: direct `mu` / `muId` / `militaryUnit` string, or nested `mu.{_id,id,muId}`
 */
export function parseUserById(raw: unknown): UserByIdRef {
  const obj = asRecord(raw) ?? {};
  const userId = pickString(obj, ["_id", "id", "userId"]);
  if (!userId) {
    throw new Error("user.getUserById response missing id");
  }
  const username = pickString(obj, ["username", "name"]);

  const companyId = pickNestedId(obj, ["companyId", "company"], ["company"]);

  const muId = pickNestedId(obj, ["mu", "muId", "militaryUnit"], ["mu", "militaryUnit"]);

  return { userId, username, companyId, muId };
}

/**
 * Pick an id that may appear either as a direct string field or as a nested
 * object. `directKeys` are probed on `obj` for a string id; `nestedKeys` are
 * probed on `obj` for a record whose `_id` / `id` / `<singular>Id` is read.
 */
function pickNestedId(
  obj: Record<string, unknown>,
  directKeys: string[],
  nestedKeys: string[],
): string | null {
  const direct = pickString(obj, directKeys);
  if (direct) return direct;

  for (const key of nestedKeys) {
    const nested = asRecord(obj[key]);
    if (nested) {
      const id = pickString(nested, ["_id", "id", ...directKeys]);
      if (id) return id;
    }
  }

  return null;
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

export async function fetchUserById(warera: WareraRequester, userId: string): Promise<UserByIdRef> {
  const json = await warera.request<unknown>(wareraProcedurePath("user.getUserById", { userId }));
  const ref = parseUserById(unwrapTrpcData(json));
  if (ref.userId !== userId) {
    throw new Error(`user.getUserById id mismatch: requested ${userId}, got ${ref.userId}`);
  }
  return ref;
}

/**
 * Batch-fetch `user.getUserById` profiles. Dedupes ids. Failed / missing slots → null.
 * Requires `warera.requestBatch` (production client always has it).
 */
export async function fetchUserByIdBatch(
  warera: WareraRequester,
  userIds: string[],
): Promise<Map<string, UserByIdRef | null>> {
  const unique = [...new Set(userIds.filter((id) => id.length > 0))];
  const out = new Map<string, UserByIdRef | null>();
  if (unique.length === 0) return out;

  if (!warera.requestBatch) {
    throw new Error("fetchUserByIdBatch requires warera.requestBatch");
  }

  try {
    const slots = await warera.requestBatch(
      unique.map((userId) => ({
        procedure: "user.getUserById",
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
        const parsed = parseUserById(slot.data);
        if (parsed.userId !== userId) {
          out.set(userId, null);
          continue;
        }
        out.set(userId, parsed);
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
