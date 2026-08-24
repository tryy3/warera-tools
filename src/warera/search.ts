import { getLogContext } from "../logging/context";
import type { Logger } from "../logging/logger";
import type { WareraRequester } from "./prices";
import { unwrapTrpcData, wareraProcedurePath } from "./trpc";

export type SearchUserHit = { userId: string; username: string };

export type SearchMuHit = { muId: string; name: string };

export type SearchMusOptions = {
  logger?: Logger;
};

function muSearchLogFields(
  searchText: string,
  extra: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const ctx = getLogContext();
  return {
    search_text: searchText,
    ...(ctx.request_id !== undefined ? { request_id: String(ctx.request_id) } : {}),
    ...extra,
  };
}

function logMuSearchDebug(
  logger: Logger | undefined,
  searchText: string,
  extra: Record<string, string | number | boolean>,
  message: string,
): void {
  logger?.debug(muSearchLogFields(searchText, extra), message);
}

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
function hydrateMuHit(muId: string, slot: { ok: boolean; data?: unknown; error?: unknown } | undefined): SearchMuHit {
  if (!slot?.ok) return { muId, name: muId };
  const mu = slot.data as { _id?: string; name?: string } | null;
  if (mu == null || typeof mu !== "object") return { muId, name: muId };
  return {
    muId: typeof mu._id === "string" ? mu._id : muId,
    name: typeof mu.name === "string" ? mu.name : muId,
  };
}

export async function searchMus(
  warera: WareraRequester,
  searchText: string,
  limit = 8,
  opts?: SearchMusOptions,
): Promise<SearchMuHit[]> {
  const logger = opts?.logger;
  const json = await warera.request<unknown>(
    wareraProcedurePath("search.searchAnything", { searchText }),
  );
  const data = unwrapTrpcData<{ muIds?: unknown }>(json);
  const rawMuIds = data.muIds;
  const allIds = Array.isArray(rawMuIds)
    ? rawMuIds.filter((id): id is string => typeof id === "string")
    : [];
  const ids = allIds.slice(0, limit);

  logMuSearchDebug(
    logger,
    searchText,
    {
      mu_id_count: ids.length,
      mu_id_raw_count: allIds.length,
      mu_id_limit: limit,
      mu_ids_json: JSON.stringify(ids),
      search_raw_json: JSON.stringify(data),
      search_raw_mu_ids_type: Array.isArray(rawMuIds) ? "array" : typeof rawMuIds,
    },
    "mu search: searchAnything response",
  );

  if (ids.length === 0) {
    logMuSearchDebug(logger, searchText, { result_count: 0 }, "mu search: no mu ids");
    return [];
  }

  if (warera.requestBatch) {
    const slots = await warera.requestBatch(
      ids.map((muId) => ({
        procedure: "mu.getById",
        input: { muId },
      })),
    );
    const failedMuIds: string[] = [];
    const hits = ids.map((muId, i) => {
      const slot = slots[i];
      if (!slot?.ok) failedMuIds.push(muId);
      return hydrateMuHit(muId, slot);
    });
    logMuSearchDebug(
      logger,
      searchText,
      {
        hydrate_ok_count: hits.length - failedMuIds.length,
        hydrate_fail_count: failedMuIds.length,
        failed_mu_ids_json: JSON.stringify(failedMuIds),
        hydrate_slots_json: JSON.stringify(
          slots.map((slot, i) => ({
            mu_id: ids[i],
            ok: slot?.ok ?? false,
            name:
              slot?.ok && slot.data != null && typeof slot.data === "object" && "name" in slot.data
                ? slot.data.name
                : null,
            error: slot?.ok ? null : slot?.error,
          })),
        ),
        results_json: JSON.stringify(hits),
        result_count: hits.length,
      },
      "mu search: hydrate complete",
    );
    return hits;
  }

  const hits: SearchMuHit[] = [];
  const failedMuIds: string[] = [];
  const hydrateSlots: Array<{ mu_id: string; ok: boolean; name: string | null }> = [];
  for (const muId of ids) {
    try {
      const muJson = await warera.request<unknown>(wareraProcedurePath("mu.getById", { muId }));
      const mu = unwrapTrpcData<{ _id?: string; name?: string }>(muJson);
      const hit = {
        muId: typeof mu._id === "string" ? mu._id : muId,
        name: typeof mu.name === "string" ? mu.name : muId,
      };
      hits.push(hit);
      hydrateSlots.push({ mu_id: muId, ok: true, name: hit.name });
    } catch {
      failedMuIds.push(muId);
      hits.push({ muId, name: muId });
      hydrateSlots.push({ mu_id: muId, ok: false, name: null });
    }
  }
  logMuSearchDebug(
    logger,
    searchText,
    {
      hydrate_ok_count: hits.length - failedMuIds.length,
      hydrate_fail_count: failedMuIds.length,
      failed_mu_ids_json: JSON.stringify(failedMuIds),
      hydrate_slots_json: JSON.stringify(hydrateSlots),
      results_json: JSON.stringify(hits),
      result_count: hits.length,
    },
    "mu search: hydrate complete",
  );
  return hits;
}
