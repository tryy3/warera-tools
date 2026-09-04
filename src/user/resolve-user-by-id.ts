import type { Db } from "../db/client";
import { getLatestUserProfile } from "../db/user-profiles";
import type { WareraRequester } from "../warera/prices";
import { fetchUserById, type UserByIdRef } from "../warera/users";

export async function resolveUserByIdRef(options: {
  db: Db;
  warera: WareraRequester;
  userId: string;
  maxAgeMs?: number;
  now?: Date;
}): Promise<UserByIdRef> {
  const { db, warera, userId } = options;
  const now = options.now ?? new Date();
  const latest = await getLatestUserProfile(db, userId);

  if (latest) {
    const ageMs = now.getTime() - latest.recordedAt.getTime();
    const fresh = options.maxAgeMs == null || ageMs <= options.maxAgeMs;
    if (fresh) {
      return {
        userId: latest.userId,
        username: latest.username,
        muId: latest.muId,
        companyId: latest.companyId,
      };
    }
  }

  return fetchUserById(warera, userId);
}
