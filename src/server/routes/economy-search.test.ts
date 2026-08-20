import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import type { Logger } from "../../logging/logger";
import { errorPayload } from "../errors";
import { economyRoutes } from "./economy";

const silentLogger = {
  silly: () => {},
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => silentLogger,
} as unknown as Logger;

const db = {} as Db;

function searchAnythingResponse(payload: Record<string, unknown>) {
  return { result: { data: payload } };
}

function appFor(request: (path: string) => Promise<unknown>) {
  const app = new Hono();
  app.onError((err, c) => {
    const { status, body } = errorPayload(err);
    return c.json(body, status as ContentfulStatusCode);
  });
  app.route("/", economyRoutes({ db, warera: { request } as never, logger: silentLogger }));
  return app;
}

describe("GET /api/economy/search", () => {
  it("returns { users } by default (type=user)", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes("search.searchAnything")) {
        return searchAnythingResponse({ userIds: ["u1"] });
      }
      if (path.includes("user.getUserLite")) {
        return { result: { data: { _id: "u1", username: "Alice" } } };
      }
      throw new Error(`unexpected call: ${path}`);
    });

    const res = await appFor(request).request("http://localhost/search?q=ab");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: unknown[]; mus?: unknown };
    expect(body.users).toEqual([{ userId: "u1", username: "Alice" }]);
    expect(body.mus).toBeUndefined();
  });

  it("returns { mus } for type=mu", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes("search.searchAnything")) {
        return searchAnythingResponse({ muIds: ["m1"] });
      }
      if (path.includes("mu.getById")) {
        return { result: { data: { _id: "m1", name: "Sweed Liberty" } } };
      }
      throw new Error(`unexpected call: ${path}`);
    });

    const res = await appFor(request).request("http://localhost/search?q=ab&type=mu");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mus: unknown[]; users?: unknown };
    expect(body.mus).toEqual([{ muId: "m1", name: "Sweed Liberty" }]);
    expect(body.users).toBeUndefined();
  });

  it("400s on unknown type", async () => {
    const request = vi.fn(async () => ({ result: { data: {} } }));
    const res = await appFor(request).request("http://localhost/search?q=ab&type=nope");
    expect(res.status).toBe(400);
    expect(request).not.toHaveBeenCalled();
  });

  it("400s when q is shorter than 2 characters", async () => {
    const request = vi.fn(async () => ({ result: { data: {} } }));
    const res = await appFor(request).request("http://localhost/search?q=a");
    expect(res.status).toBe(400);
    expect(request).not.toHaveBeenCalled();
  });

  it("400s when q is missing", async () => {
    const request = vi.fn(async () => ({ result: { data: {} } }));
    const res = await appFor(request).request("http://localhost/search");
    expect(res.status).toBe(400);
    expect(request).not.toHaveBeenCalled();
  });

  it("accepts type=user explicitly", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes("search.searchAnything")) {
        return searchAnythingResponse({ userIds: ["u1"] });
      }
      if (path.includes("user.getUserLite")) {
        return { result: { data: { _id: "u1", username: "Alice" } } };
      }
      throw new Error(`unexpected call: ${path}`);
    });

    const res = await appFor(request).request("http://localhost/search?q=ab&type=user");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: unknown[] };
    expect(body.users).toEqual([{ userId: "u1", username: "Alice" }]);
  });
});
