import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { fetchUser, userPath } from "./fetchUser";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("userPath", () => {
  it("omits refresh by default", () => {
    expect(userPath("u1", false)).toBe("/api/user?userId=u1");
  });

  it("adds refresh=1 when requested", () => {
    expect(userPath("u1", true)).toBe("/api/user?userId=u1&refresh=1");
  });

  it("encodes userId", () => {
    expect(userPath("a b", false)).toBe("/api/user?userId=a%20b");
  });
});

describe("fetchUser", () => {
  it("calls api path without refresh", async () => {
    const fetchMock = vi.fn(async (_path: string) =>
      Response.json({
        userId: "u1",
        username: "test",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchUser("u1", false);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [path] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/api/user?userId=u1");
  });

  it("calls api path with refresh=1", async () => {
    const fetchMock = vi.fn(async (_path: string) =>
      Response.json({
        userId: "u1",
        username: "test",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchUser("u1", true);

    const [path] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/api/user?userId=u1&refresh=1");
  });
});
