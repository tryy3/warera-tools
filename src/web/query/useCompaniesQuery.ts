import { useQuery } from "@tanstack/react-query";
import { fetchAdvisor } from "./fetchAdvisor";
import { queryKeys } from "./keys";

export function useCompaniesQuery(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.companies(userId ?? ""),
    queryFn: () => fetchAdvisor(userId!, false),
    enabled: Boolean(userId),
  });
}
