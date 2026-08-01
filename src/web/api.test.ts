import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ApiError, api } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
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
