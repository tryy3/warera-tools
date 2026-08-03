import type { QueryClient } from "@tanstack/react-query";
import { fetchAdvisor } from "./fetchAdvisor";
import { fetchUser } from "./fetchUser";
import { queryKeys } from "./keys";

/** Explicit shell Load/Refresh: bust server company pack + user, then drop growth cache. */
export async function loadPlayerData(queryClient: QueryClient, userId: string): Promise<void> {
  await queryClient.fetchQuery({
    queryKey: queryKeys.companies(userId),
    queryFn: () => fetchAdvisor(userId, true),
  });
  await queryClient.fetchQuery({
    queryKey: queryKeys.user(userId),
    queryFn: () => fetchUser(userId, true),
  });
  await queryClient.invalidateQueries({ queryKey: queryKeys.growthBootstrap(userId) });
}
