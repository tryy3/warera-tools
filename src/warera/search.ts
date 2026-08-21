import { unwrapTrpcData, wareraProcedurePath } from "./trpc";
import type { WareraRequester } from "./prices";

export type SearchUserHit = { userId: string; username: string };

export type SearchMuHit = { muId: string; name: string };

export async function searchUsers(
  warera: WareraRequester,
  searchText: string,
  limit = 8,
): Promise<SearchUserHit[]> {
  const json = await warera.request<unknown>(
    wareraProcedurePath("search.searchAnything", { searchText }),
  );
  const data = unwrapTrpcData<{ userIds?: unknown }>(json);
  const ids = Array.isArray(data.userIds)
    ? data.userIds.filter((id): id is string => typeof id === "string").slice(0, limit)
    : [];

  const hits: SearchUserHit[] = [];
  for (const userId of ids) {
    try {
      const liteJson = await warera.request<unknown>(
        wareraProcedurePath("user.getUserLite", { userId }),
      );
      const lite = unwrapTrpcData<{ _id?: string; username?: string }>(liteJson);
      hits.push({
        userId: typeof lite._id === "string" ? lite._id : userId,
        username: typeof lite.username === "string" ? lite.username : userId,
      });
    } catch {
      hits.push({ userId, username: userId });
    }
  }
  return hits;
}

/**
 * Resolve MU names for the follow add picker. Search only returns `muIds`,
 * so ids are hydrated via `mu.getById` (batched when `requestBatch` exists).
 * Collection uses stored ids; this function must never be called from a job.
 */
export async function searchMus(
  warera: WareraRequester,
  searchText: string,
  limit = 8,
): Promise<SearchMuHit[]> {
  const json = await warera.request<unknown>(
    wareraProcedurePath("search.searchAnything", { searchText }),
  );
  const data = unwrapTrpcData<{ muIds?: unknown }>(json);
  const ids = Array.isArray(data.muIds)
    ? data.muIds.filter((id): id is string => typeof id === "string").slice(0, limit)
    : [];

  if (ids.length === 0) return [];

  if (warera.requestBatch) {
    const slots = await warera.requestBatch(
      ids.map((muId) => ({
        procedure: "mu.getById",
        input: { muId },
      })),
    );
    return ids.map((muId, i) => {
      const slot = slots[i];
      if (!slot?.ok) return { muId, name: muId };
      const mu = slot.data as { _id?: string; name?: string } | null;
      if (mu == null || typeof mu !== "object") return { muId, name: muId };
      return {
        muId: typeof mu._id === "string" ? mu._id : muId,
        name: typeof mu.name === "string" ? mu.name : muId,
      };
    });
  }

  const hits: SearchMuHit[] = [];
  for (const muId of ids) {
    try {
      const muJson = await warera.request<unknown>(wareraProcedurePath("mu.getById", { muId }));
      const mu = unwrapTrpcData<{ _id?: string; name?: string }>(muJson);
      hits.push({
        muId: typeof mu._id === "string" ? mu._id : muId,
        name: typeof mu.name === "string" ? mu.name : muId,
      });
    } catch {
      hits.push({ muId, name: muId });
    }
  }
  return hits;
}
