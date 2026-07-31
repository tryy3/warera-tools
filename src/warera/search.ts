import { unwrapTrpcData, wareraProcedurePath } from "./trpc";
import type { WareraRequester } from "./prices";

export type SearchUserHit = { userId: string; username: string };

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
