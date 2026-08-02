import { useQuery } from "@tanstack/react-query";
import { fetchGrowthBootstrap } from "./fetchGrowthBootstrap";
import { queryKeys } from "./keys";

export function useGrowthBootstrapQuery(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.growthBootstrap(userId ?? ""),
    queryFn: () => fetchGrowthBootstrap(userId!, false),
    enabled: Boolean(userId),
  });
}
