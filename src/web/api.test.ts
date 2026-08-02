import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ApiError, api } from "./api";
import { webLogger } from "./logger";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("api", () => {
  it("throws ApiError with status and code from HttpError JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: "not_found", message: "No price history for steel" } },
          { status: 404 },
        ),
      ),
    );

    await expect(api("/api/prices/history/steel")).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ApiError &&
        err.status === 404 &&
        err.code === "not_found" &&
        err.message === "No price history for steel",
    );
  });
});

describe("api logging", () => {
  it("logs successful requests at debug", async () => {
    const debug = vi.spyOn(webLogger, "debug");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true }, { status: 200 })),
    );

    await api<{ ok: boolean }>("/api/health");

    expect(debug).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/health",
        status: 200,
        durationMs: expect.any(Number),
      }),
      "api request",
    );
  });

  it("logs failed requests at warn", async () => {
    const warn = vi.spyOn(webLogger, "warn");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: "not_found", message: "missing" } },
          { status: 404 },
        ),
      ),
    );

    await expect(api("/api/missing")).rejects.toBeInstanceOf(ApiError);

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/missing",
        status: 404,
        durationMs: expect.any(Number),
      }),
      "api request",
    );
  });
});
