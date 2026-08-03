import type { QueryClient } from "@tanstack/react-query";
import { fetchAdvisor } from "./fetchAdvisor";
import { fetchUser } from "./fetchUser";
import { queryKeys } from "./keys";

/** Explicit shell Load/Refresh: bust server company pack, then drop bootstrap caches. */
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
  await queryClient.invalidateQueries({ queryKey: queryKeys.skillsBootstrap(userId) });
}
