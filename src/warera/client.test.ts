import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createWareraClient } from "./client";
import type { AppConfig } from "../config/env";

const baseConfig = {
  wareraApiBaseUrl: "https://gateway.warerastats.io/trpc",
  wareraApiKey: "test-key",
  wareraMaxRequestsPerMinute: 1000,
} as AppConfig;

function testLogger() {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn() }),
  } as never;
}

describe("createWareraClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retries GET on 503 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createWareraClient({
      config: baseConfig,
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    const result = await client.request<{ ok: boolean }>("/v1/ping");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry POST on 503", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 503 }));
    const client = createWareraClient({
      config: baseConfig,
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    await expect(client.request("/v1/ping", { method: "POST" })).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries GET on network error then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const client = createWareraClient({
      config: baseConfig,
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    const result = await client.request<{ ok: boolean }>("/v1/ping");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops after 2 retries on repeated 503", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Response("down", { status: 503 }));
    const client = createWareraClient({
      config: baseConfig,
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    await expect(client.request("/v1/ping")).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("sends X-API-Key when using the gateway base URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const client = createWareraClient({
      config: baseConfig,
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    await client.request("/country.getAllCountries");
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("X-API-Key")).toBe("test-key");
    expect(headers.get("Authorization")).toBeNull();
  });

  it("sends Bearer Authorization when using the official api2 base URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const client = createWareraClient({
      config: {
        ...baseConfig,
        wareraApiBaseUrl: "https://api2.warera.io/trpc",
      },
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    await client.request("/country.getAllCountries");
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-key");
    expect(headers.get("X-API-Key")).toBeNull();
  });

  it("serializes rate-limit acquire across concurrent requests", async () => {
    let t = 0;
    const sleep = vi.fn(async (ms: number) => {
      t += ms;
    });
    const fetchMock = vi
      .fn()
      .mockImplementation(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const client = createWareraClient({
      config: { ...baseConfig, wareraMaxRequestsPerMinute: 1 },
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep,
      now: () => t,
    });

    await Promise.all([client.request("/a"), client.request("/b")]);
    expect(sleep).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips rate limit when skipRateLimit is set", async () => {
    let t = 0;
    const sleep = vi.fn(async (ms: number) => {
      t += ms;
    });
    const fetchMock = vi
      .fn()
      .mockImplementation(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const client = createWareraClient({
      config: { ...baseConfig, wareraMaxRequestsPerMinute: 1 },
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep,
      now: () => t,
    });

    await client.request("/a");
    await client.request("/b", { skipRateLimit: true });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("logs path, status, and durationMs", async () => {
    const logger = testLogger() as { debug: ReturnType<typeof vi.fn> };
    const fetchMock = vi
      .fn()
      .mockImplementation(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const client = createWareraClient({
      config: baseConfig,
      logger: logger as never,
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    await client.request("/v1/ping");
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/v1/ping", status: 200, durationMs: expect.any(Number) }),
      expect.any(String),
    );
  });

  it("falls back to api2 when gateway returns unknown method", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("unknown method: company.getProductionBonus\n", { status: 400 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: { data: { total: 50.5 } } }), { status: 200 }),
      );

    const client = createWareraClient({
      config: baseConfig,
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    const result = await client.request<{ result: { data: { total: number } } }>(
      "company.getProductionBonus?input=%7B%7D",
    );
    expect(result.result.data.total).toBe(50.5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]![0])).toContain("api2.warera.io");
  });

  it("requestBatch returns [] without fetch for empty items", async () => {
    const fetchMock = vi.fn();
    const client = createWareraClient({
      config: baseConfig,
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });
    await expect(client.requestBatch([])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requestBatch sends one GET with batch=1 for multiple items", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            { result: { data: { username: "A" } } },
            { result: { data: { username: "B" } } },
            { error: { message: "nope" } },
          ]),
          { status: 207 },
        ),
      );
    const client = createWareraClient({
      config: { ...baseConfig, wareraMaxRequestsPerMinute: 1 },
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    const results = await client.requestBatch([
      { procedure: "user.getUserLite", input: { userId: "u1" } },
      { procedure: "user.getUserLite", input: { userId: "u2" } },
      { procedure: "user.getUserLite", input: { userId: "u3" } },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("user.getUserLite,user.getUserLite,user.getUserLite");
    expect(url).toContain("batch=1");
    expect(results).toEqual([
      { ok: true, data: { username: "A" } },
      { ok: true, data: { username: "B" } },
      { ok: false, error: { message: "nope" } },
    ]);
  });

  it("POSTs JSON with X-API-Key when authStyle is api-key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ result: { data: ["region-1"] } }), { status: 200 }),
      );

    const client = createWareraClient({
      config: {
        ...baseConfig,
        wareraApiBaseUrl: "https://gateway.warerastats.io/trpc",
      },
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    await client.request("company.getRecommendedRegionIdsByItemCode", {
      method: "POST",
      json: { itemCode: "lead", count: 1 },
      authStyle: "api-key",
      baseUrl: "https://api2.warera.io/trpc",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api2.warera.io/trpc/company.getRecommendedRegionIdsByItemCode",
    );
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ itemCode: "lead", count: 1 }));
    const headers = new Headers(init.headers);
    expect(headers.get("X-API-Key")).toBe("test-key");
    expect(headers.get("Authorization")).toBeNull();
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("requestBatch POSTs one URL ending in ?batch=1 with indexed body and X-API-Key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            { result: { data: [{ dailyDate: "2026-08-19", total: 1 }] } },
            { result: { data: [{ dailyDate: "2026-08-19", total: 2 }] } },
          ]),
          { status: 200 },
        ),
      );
    const client = createWareraClient({
      config: baseConfig,
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    const results = await client.requestBatch(
      [
        { procedure: "work.getStatsByCompany", input: { companyId: "c1", days: 14 } },
        { procedure: "work.getStatsByCompany", input: { companyId: "c2", days: 14 } },
      ],
      {
        method: "POST",
        authStyle: "api-key",
        baseUrl: "https://api2.warera.io/trpc",
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api2.warera.io/trpc/work.getStatsByCompany,work.getStatsByCompany?batch=1",
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      "0": { companyId: "c1", days: 14 },
      "1": { companyId: "c2", days: 14 },
    });
    const headers = new Headers(init.headers);
    expect(headers.get("X-API-Key")).toBe("test-key");
    expect(headers.get("content-type")).toBe("application/json");
    expect(results).toEqual([
      { ok: true, data: [{ dailyDate: "2026-08-19", total: 1 }] },
      { ok: true, data: [{ dailyDate: "2026-08-19", total: 2 }] },
    ]);
  });
});
