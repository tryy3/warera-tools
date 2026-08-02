import { QueryClient } from "@tanstack/react-query";

/** Slightly under server company_packs TTL (600s). */
export const COMPANY_PACK_STALE_MS = 9 * 60 * 1000;

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: COMPANY_PACK_STALE_MS,
        gcTime: COMPANY_PACK_STALE_MS,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
