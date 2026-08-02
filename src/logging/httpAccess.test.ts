import { Hono } from "hono";
import { describe, expect, it, vi } from "vite-plus/test";
import { httpAccess } from "./httpAccess";
import type { Logger } from "./types";

function mockLogger() {
  const child = {
    silly: vi.fn(),
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  };
  child.child.mockReturnValue(child);
  const logger = {
    ...child,
    child: vi.fn(() => child),
  } satisfies Logger;
  return { logger, child };
}

describe("httpAccess", () => {
  it("logs 2xx at debug with structured fields", async () => {
    const { logger, child } = mockLogger();
    const app = new Hono();
    app.use("/api/*", httpAccess(logger));
    app.get("/api/health", (c) => c.json({ ok: true }));

    await app.request("/api/health");

    expect(child.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/api/health",
        status: 200,
        durationMs: expect.any(Number),
        requestId: expect.any(String),
      }),
      "http request",
    );
  });

  it("logs 4xx at warn and 5xx at error", async () => {
    const { logger, child } = mockLogger();
    const app = new Hono();
    app.use("/api/*", httpAccess(logger));
    app.get("/api/nope", (c) => c.json({ error: "x" }, 404));
    app.get("/api/boom", (c) => c.json({ error: "x" }, 500));

    await app.request("/api/nope");
    expect(child.warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404 }),
      "http request",
    );

    await app.request("/api/boom");
    expect(child.error).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500 }),
      "http request",
    );
  });
});
