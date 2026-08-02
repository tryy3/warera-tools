import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { fetchSkillsBootstrap, skillsBootstrapPath } from "./fetchSkillsBootstrap";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("skillsBootstrapPath", () => {
  it("omits refresh by default", () => {
    expect(skillsBootstrapPath("u1", false)).toBe("/api/skills/bootstrap?userId=u1");
  });

  it("adds refresh=1 when requested", () => {
    expect(skillsBootstrapPath("u1", true)).toBe("/api/skills/bootstrap?userId=u1&refresh=1");
  });

  it("encodes userId", () => {
    expect(skillsBootstrapPath("a b", false)).toBe("/api/skills/bootstrap?userId=a%20b");
  });
});

describe("fetchSkillsBootstrap", () => {
  it("calls api path without refresh", async () => {
    const fetchMock = vi.fn(async (_path: string) =>
      Response.json({
        skills: {},
        companies: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchSkillsBootstrap("u1", false);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [path] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/api/skills/bootstrap?userId=u1");
  });

  it("calls api path with refresh=1", async () => {
    const fetchMock = vi.fn(async (_path: string) =>
      Response.json({
        skills: {},
        companies: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchSkillsBootstrap("u1", true);

    const [path] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/api/skills/bootstrap?userId=u1&refresh=1");
  });
});
