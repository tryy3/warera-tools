import type { QueryClient } from "@tanstack/react-query";
import { fetchAdvisor } from "./fetchAdvisor";
import { queryKeys } from "./keys";

/** Explicit shell Load/Refresh: bust server company pack, then drop growth bootstrap cache. */
export async function loadPlayerData(queryClient: QueryClient, userId: string): Promise<void> {
  await queryClient.fetchQuery({
    queryKey: queryKeys.companies(userId),
    queryFn: () => fetchAdvisor(userId, true),
  });
  await queryClient.invalidateQueries({ queryKey: queryKeys.growthBootstrap(userId) });
}
