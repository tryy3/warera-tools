import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { loadPlayerData } from "./loadPlayerData";
import { queryKeys } from "./keys";

const { fetchAdvisorMock, fetchUserMock } = vi.hoisted(() => ({
  fetchAdvisorMock: vi.fn(async (_userId: string, _refresh: boolean) => ({
    recordedAt: null,
    companiesFetchedAt: 1,
    companiesRefreshed: true,
    opportunities: [],
    companies: [],
  })),
  fetchUserMock: vi.fn(async (_userId: string, _refresh: boolean) => ({
    userId: "u1",
    username: "test",
    recordedAt: null,
    companiesFetchedAt: 1,
    companiesRefreshed: true,
    leveling: {},
    skills: {},
    job: { wagePerPp: 0, companyId: null },
    companies: [],
    income: { total: 0, breakdown: [] },
  })),
}));

vi.mock("./fetchAdvisor", () => ({
  fetchAdvisor: (userId: string, refresh: boolean) => fetchAdvisorMock(userId, refresh),
}));

vi.mock("./fetchUser", () => ({
  fetchUser: (userId: string, refresh: boolean) => fetchUserMock(userId, refresh),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadPlayerData", () => {
  it("fetches advisor and user with refresh=1 and invalidates growth bootstrap", async () => {
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

    expect(fetchQuery).toHaveBeenCalledTimes(2);

    const companiesCall = fetchQuery.mock.calls[0]![0] as {
      queryKey: readonly unknown[];
      queryFn: () => Promise<unknown>;
    };
    expect(companiesCall.queryKey).toEqual(queryKeys.companies("u1"));
    expect(fetchAdvisorMock).toHaveBeenCalledWith("u1", true);

    const userCall = fetchQuery.mock.calls[1]![0] as {
      queryKey: readonly unknown[];
      queryFn: () => Promise<unknown>;
    };
    expect(userCall.queryKey).toEqual(queryKeys.user("u1"));
    expect(fetchUserMock).toHaveBeenCalledWith("u1", true);

    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.growthBootstrap("u1"),
    });
  });
});
