import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { fetchGrowthBootstrap, growthBootstrapPath } from "./fetchGrowthBootstrap";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("growthBootstrapPath", () => {
  it("omits refresh by default", () => {
    expect(growthBootstrapPath("u1", false)).toBe("/api/growth/bootstrap?userId=u1");
  });

  it("adds refresh=1 when requested", () => {
    expect(growthBootstrapPath("u1", true)).toBe("/api/growth/bootstrap?userId=u1&refresh=1");
  });

  it("encodes userId", () => {
    expect(growthBootstrapPath("a b", false)).toBe("/api/growth/bootstrap?userId=a%20b");
  });
});

describe("fetchGrowthBootstrap", () => {
  it("calls api path without refresh", async () => {
    const fetchMock = vi.fn(async (_path: string) =>
      Response.json({
        factories: [],
        prices: {},
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchGrowthBootstrap("u1", false);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [path] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/api/growth/bootstrap?userId=u1");
  });

  it("calls api path with refresh=1", async () => {
    const fetchMock = vi.fn(async (_path: string) =>
      Response.json({
        factories: [],
        prices: {},
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchGrowthBootstrap("u1", true);

    const [path] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/api/growth/bootstrap?userId=u1&refresh=1");
  });
});
