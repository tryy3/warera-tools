import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createWareraClient } from "./client";
import type { AppConfig } from "../config/env";

const baseConfig = {
  wareraApiBaseUrl: "https://api2.warera.io/trpc",
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

  it("does not retry an HTTP 200 response with invalid JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("not json", { status: 200 }));
    const client = createWareraClient({
      config: baseConfig,
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    await expect(client.request("/v1/ping")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops after 3 retries on repeated 503", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Response("down", { status: 503 }));
    const client = createWareraClient({
      config: baseConfig,
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    await expect(client.request("/v1/ping")).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("sends X-API-Key when using the gateway base URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const client = createWareraClient({
      config: {
        ...baseConfig,
        wareraApiBaseUrl: "https://gateway.warerastats.io/trpc",
      },
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

  it("does not advance the governor clock once per concurrent sleep", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let t = 0;
    const sleeps: Array<{ ms: number; resolve: () => void }> = [];
    const sleep = vi.fn(
      (ms: number) =>
        new Promise<void>((resolve) => {
          sleeps.push({ ms, resolve });
        }),
    );
    let resolveFirstFetch!: (response: Response) => void;
    const firstFetch = new Promise<Response>((resolve) => {
      resolveFirstFetch = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstFetch)
      .mockImplementation(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = createWareraClient({
      config: { ...baseConfig, wareraMaxRequestsPerMinute: 1 },
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep,
      now: () => t,
    });

    const first = client.request("/a");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const second = client.request("/b");
    await vi.waitFor(() => expect(sleeps).toHaveLength(1));
    expect(sleeps[0]?.ms).toBe(60_001);

    resolveFirstFetch(
      new Response("slow down", {
        status: 429,
        headers: { "Retry-After": "10" },
      }),
    );
    await vi.waitFor(() => expect(sleeps).toHaveLength(2));
    expect(sleeps[1]?.ms).toBe(10_010);

    t = 60_001;
    sleeps[0]?.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    sleeps[1]?.resolve();
    await vi.waitFor(() => expect(sleeps).toHaveLength(3));
    expect(sleeps[2]?.ms).toBe(60_001);

    t = 120_002;
    sleeps[2]?.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([{ ok: true }, { ok: true }]);
  });

  it("skips local budget waits when skipRateLimit is set and headers are healthy", async () => {
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
      expect.objectContaining({
        path: "/v1/ping",
        status: 200,
        durationMs: expect.any(Number),
        outcome: "ok",
      }),
      expect.any(String),
    );
  });

  it("does not retry POST when another query value contains batch=1", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 503 }));
    const client = createWareraClient({
      config: baseConfig,
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    await expect(client.request("procedure?input=batch=1", { method: "POST" })).rejects.toThrow(
      /503/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not fall back to a second host on unknown method", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response("unknown method: company.getProductionBonus\n", { status: 400 }),
      );
    const client = createWareraClient({
      config: baseConfig,
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });
    await expect(client.request("company.getProductionBonus?input=%7B%7D")).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it("requestBatch of 51 items sends two HTTP calls (50 + 1)", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const path = String(url).split("?")[0];
      const procs = path.split("/").pop()!.split(",");
      return new Response(JSON.stringify(procs.map(() => ({ result: { data: {} } }))), {
        status: 200,
      });
    });
    const client = createWareraClient({
      config: { ...baseConfig, wareraMaxRequestsPerMinute: 10_000 },
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });
    const items = Array.from({ length: 51 }, () => ({ procedure: "a" }));
    const results = await client.requestBatch(items);
    expect(results).toHaveLength(51);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = String(fetchMock.mock.calls[0]![0]);
    expect(firstUrl.split("?")[0].split("/").pop()!.split(",")).toHaveLength(50);
  });

  it("429 note429 runs before body read and stays rate_limited when text() rejects", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ "Retry-After": "1", "ratelimit-remaining": "0" }),
        text: () => Promise.reject(new Error("body read failed")),
      } as Response)
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    let t = 0;
    const sleep = vi.fn(async (ms: number) => {
      t += ms;
    });
    const logger = testLogger() as { debug: ReturnType<typeof vi.fn> };
    const client = createWareraClient({
      config: { ...baseConfig, wareraMaxRequestsPerMinute: 10_000 },
      logger: logger as never,
      fetchImpl: fetchMock,
      sleep,
      now: () => t,
    });

    await expect(client.request("/v1/ping")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/v1/ping",
        status: 429,
        outcome: "rate_limited",
      }),
      expect.any(String),
    );
    expect(logger.debug).not.toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "network_error" }),
      expect.any(String),
    );
  });

  it("skipRateLimit still waits after 429 and logs rate_limited", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("slow down", {
          status: 429,
          headers: { "ratelimit-reset": "1", "ratelimit-remaining": "0" },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    let t = 0;
    const sleep = vi.fn(async (ms: number) => {
      t += ms;
    });
    const logger = testLogger() as { debug: ReturnType<typeof vi.fn> };
    const client = createWareraClient({
      config: { ...baseConfig, wareraMaxRequestsPerMinute: 10_000 },
      logger: logger as never,
      fetchImpl: fetchMock,
      sleep,
      now: () => t,
    });
    await expect(client.request("/v1/ping", { skipRateLimit: true })).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/v1/ping",
        status: 429,
        outcome: "rate_limited",
      }),
      expect.any(String),
    );
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
