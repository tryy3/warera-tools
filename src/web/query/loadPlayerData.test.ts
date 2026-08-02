import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { loadPlayerData } from "./loadPlayerData";
import { queryKeys } from "./keys";

const { fetchAdvisorMock } = vi.hoisted(() => ({
  fetchAdvisorMock: vi.fn(async (_userId: string, _refresh: boolean) => ({
    recordedAt: null,
    companiesFetchedAt: 1,
    companiesRefreshed: true,
    opportunities: [],
    companies: [],
  })),
}));

vi.mock("./fetchAdvisor", () => ({
  fetchAdvisor: (userId: string, refresh: boolean) => fetchAdvisorMock(userId, refresh),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadPlayerData", () => {
  it("fetches advisor with refresh=1 and invalidates bootstrap caches", async () => {
    const queryClient = new QueryClient();
    const fetchQuery = vi.spyOn(queryClient, "fetchQuery").mockImplementation(async (options) => {
      const queryFn = options.queryFn as (() => Promise<unknown>) | undefined;
      if (!queryFn) throw new Error("expected queryFn");
      return queryFn();
    });
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    await loadPlayerData(queryClient, "u1");

    expect(fetchQuery).toHaveBeenCalledOnce();
    const arg = fetchQuery.mock.calls[0]![0] as {
      queryKey: readonly unknown[];
      queryFn: () => Promise<unknown>;
    };
    expect(arg.queryKey).toEqual(queryKeys.companies("u1"));

    expect(fetchAdvisorMock).toHaveBeenCalledWith("u1", true);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.growthBootstrap("u1"),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.skillsBootstrap("u1"),
    });
  });
});
