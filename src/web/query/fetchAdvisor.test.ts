import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { advisorPath, fetchAdvisor } from "./fetchAdvisor";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("advisorPath", () => {
  it("omits refresh by default", () => {
    expect(advisorPath("u1", false)).toBe("/api/economy/advisor?userId=u1");
  });

  it("adds refresh=1 when requested", () => {
    expect(advisorPath("u1", true)).toBe("/api/economy/advisor?userId=u1&refresh=1");
  });

  it("encodes userId", () => {
    expect(advisorPath("a b", false)).toBe("/api/economy/advisor?userId=a%20b");
  });
});

describe("fetchAdvisor", () => {
  it("calls api path without refresh", async () => {
    const fetchMock = vi.fn(async (_path: string) =>
      Response.json({
        recordedAt: null,
        companiesFetchedAt: 1,
        companiesRefreshed: false,
        opportunities: [],
        companies: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchAdvisor("u1", false);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [path] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/api/economy/advisor?userId=u1");
  });

  it("calls api path with refresh=1", async () => {
    const fetchMock = vi.fn(async (_path: string) =>
      Response.json({
        recordedAt: null,
        companiesFetchedAt: 1,
        companiesRefreshed: true,
        opportunities: [],
        companies: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchAdvisor("u1", true);

    const [path] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/api/economy/advisor?userId=u1&refresh=1");
  });
});
