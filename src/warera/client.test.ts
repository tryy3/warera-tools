import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { Logger as TsLogger } from "tslog";
import { createWareraClient, WARERA_BATCH_WINDOW_MS } from "./client";
import type { AppConfig } from "../config/env";
import { registerServerTsLogger, withLogContext } from "../logging/context";
import { resetMetricsForTests, setMetricsBackend } from "../metrics";
import { createRecordingBackend } from "../metrics/recording";

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
    registerServerTsLogger(null);
    resetMetricsForTests();
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

  it("logs procedure, call class, status, duration, and outcome", async () => {
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
        procedure: "v1/ping",
        call_class: "interactive",
        status: 200,
        durationMs: expect.any(Number),
        outcome: "ok",
      }),
      "warera request",
    );
  });

  it("emits call/latency/batch metrics on success", async () => {
    const rec = createRecordingBackend();
    setMetricsBackend(rec);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "ratelimit-remaining": "498", "ratelimit-reset": "59" },
      }),
    );
    const client = createWareraClient({
      config: { ...baseConfig, wareraMaxRequestsPerMinute: 10_000 },
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });
    await client.request("country.getAllCountries", { callClass: "interactive" });
    expect(rec.events.some((e) => e.type === "count" && e.name === "warera.upstream.call")).toBe(
      true,
    );
    expect(
      rec.events.some(
        (e) =>
          e.type === "count" &&
          e.name === "warera.upstream.call" &&
          e.attrs?.procedure === "country.getAllCountries" &&
          e.attrs?.call_class === "interactive" &&
          e.attrs?.outcome === "ok",
      ),
    ).toBe(true);
    expect(
      rec.events.some(
        (e) =>
          e.type === "gauge" &&
          e.name === "warera.upstream.rate_limit_remaining" &&
          e.value === 498,
      ),
    ).toBe(true);
    expect(
      rec.events.some(
        (e) =>
          e.type === "distribution" &&
          e.name === "warera.upstream.latency_ms" &&
          e.attrs?.call_class === "interactive" &&
          e.attrs?.outcome === "ok",
      ),
    ).toBe(true);
    expect(
      rec.events.some(
        (e) =>
          e.type === "distribution" && e.name === "warera.upstream.batch_size" && e.value === 1,
      ),
    ).toBe(true);
    expect(
      rec.events.some(
        (e) =>
          e.type === "distribution" &&
          e.name === "warera.upstream.response_bytes" &&
          e.value === 11,
      ),
    ).toBe(true);
  });

  it("emits rate_limit_wait_ms when governor pauses", async () => {
    const rec = createRecordingBackend();
    setMetricsBackend(rec);
    let t = 0;
    const sleep = vi.fn(async (ms: number) => {
      t += ms;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "ratelimit-remaining": "0", "ratelimit-reset": "1" },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const client = createWareraClient({
      config: { ...baseConfig, wareraMaxRequestsPerMinute: 10_000 },
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep,
      now: () => t,
    });

    await client.request("/v1/ping");
    await client.request("/v1/ping");
    expect(
      rec.events.some(
        (e) =>
          e.type === "distribution" &&
          e.name === "warera.upstream.rate_limit_wait_ms" &&
          e.attrs?.reason === "header_exhausted" &&
          (e.value as number) >= 1000,
      ),
    ).toBe(true);
  });

  it("records wire response_bytes not JSON.stringify length", async () => {
    const rec = createRecordingBackend();
    setMetricsBackend(rec);
    const wireBody = '{ "a": 1 }\n';
    const fetchMock = vi.fn().mockResolvedValue(new Response(wireBody, { status: 200 }));
    const client = createWareraClient({
      config: { ...baseConfig, wareraMaxRequestsPerMinute: 10_000 },
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    await client.request("/v1/ping");
    expect(
      rec.events.some(
        (e) =>
          e.type === "distribution" &&
          e.name === "warera.upstream.response_bytes" &&
          e.value === wireBody.length,
      ),
    ).toBe(true);
    expect(wireBody.length).not.toBe(JSON.stringify({ a: 1 }).length);
  });

  it("dedups two concurrent identical POST singles with json body", async () => {
    const rec = createRecordingBackend();
    setMetricsBackend(rec);
    let resolveFetch!: (value: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const client = createWareraClient({
      config: { ...baseConfig, wareraMaxRequestsPerMinute: 10_000 },
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    const init = {
      method: "POST" as const,
      json: { itemCode: "lead", count: 1 },
      authStyle: "api-key" as const,
    };
    const first = client.request("company.getRecommendedRegionIdsByItemCode", init);
    const second = client.request("company.getRecommendedRegionIdsByItemCode", init);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    resolveFetch(new Response(JSON.stringify({ result: { data: ["reg-a"] } }), { status: 200 }));
    await expect(Promise.all([first, second])).resolves.toEqual([
      { result: { data: ["reg-a"] } },
      { result: { data: ["reg-a"] } },
    ]);
    expect(
      rec.events.some(
        (event) => event.type === "count" && event.name === "warera.upstream.dedup_join",
      ),
    ).toBe(true);
  });

  it("treats malformed GET input query as undefined for dedup", async () => {
    let resolveFetch!: (value: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const client = createWareraClient({
      config: { ...baseConfig, wareraMaxRequestsPerMinute: 10_000 },
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    const path = "user.getUserLite?input=not-json";
    const first = client.request(path);
    const second = client.request(path);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    resolveFetch(new Response(JSON.stringify({ result: { data: { id: "a" } } }), { status: 200 }));
    await expect(Promise.all([first, second])).resolves.toEqual([
      { result: { data: { id: "a" } } },
      { result: { data: { id: "a" } } },
    ]);
  });

  it("dedups two concurrent identical GET singles", async () => {
    const rec = createRecordingBackend();
    setMetricsBackend(rec);
    let resolveFetch!: (value: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const client = createWareraClient({
      config: { ...baseConfig, wareraMaxRequestsPerMinute: 10_000 },
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    const path = "user.getUserLite?input=%7B%22userId%22%3A%22a%22%7D";
    const first = client.request(path);
    const second = client.request(path);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    resolveFetch(new Response(JSON.stringify({ result: { data: { id: "a" } } }), { status: 200 }));
    await expect(Promise.all([first, second])).resolves.toEqual([
      { result: { data: { id: "a" } } },
      { result: { data: { id: "a" } } },
    ]);
    expect(
      rec.events.some(
        (event) => event.type === "count" && event.name === "warera.upstream.dedup_join",
      ),
    ).toBe(true);
  });

  it("infers background context and preserves compatible init while batching", async () => {
    const waits: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      waits.push(ms);
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify([{ result: { data: { id: "a" } } }, { result: { data: { id: "b" } } }]),
          { status: 200 },
        ),
      );
    const client = createWareraClient({
      config: { ...baseConfig, wareraMaxRequestsPerMinute: 10_000 },
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep,
    });
    const log = new TsLogger({ type: "hidden", minLevel: "INFO" });
    registerServerTsLogger(log);
    const controller = new AbortController();

    const results = await withLogContext(
      {
        attributes: { job_id: "j" },
        spanName: "j",
        spanOp: "job.run",
      },
      () =>
        Promise.all([
          client.request("user.getUserLite?input=%7B%22userId%22%3A%22a%22%7D", {
            headers: { "x-correlation": "shared" },
            signal: controller.signal,
          }),
          client.request("user.getUserLite?input=%7B%22userId%22%3A%22b%22%7D", {
            headers: { "x-correlation": "shared" },
            signal: controller.signal,
          }),
        ]),
    );

    expect(waits).toContain(WARERA_BATCH_WINDOW_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("batch=1");
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get("x-correlation")).toBe("shared");
    expect(init.signal).toBe(controller.signal);
    expect(results).toEqual([{ result: { data: { id: "a" } } }, { result: { data: { id: "b" } } }]);
  });

  it("does not coalesce background GET singles with incompatible headers", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const requestId = new Headers(init.headers).get("x-request-id");
      return new Response(JSON.stringify({ result: { data: { requestId } } }), { status: 200 });
    });
    const client = createWareraClient({
      config: { ...baseConfig, wareraMaxRequestsPerMinute: 10_000 },
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    const results = await Promise.all([
      client.request("user.getUserLite?input=%7B%22userId%22%3A%22a%22%7D", {
        callClass: "background",
        headers: { "x-request-id": "a" },
      }),
      client.request("user.getUserLite?input=%7B%22userId%22%3A%22b%22%7D", {
        callClass: "background",
        headers: { "x-request-id": "b" },
      }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("batch=1"))).toBe(true);
    expect(results).toEqual([
      { result: { data: { requestId: "a" } } },
      { result: { data: { requestId: "b" } } },
    ]);
  });

  it("records rate_limited on 429 then ok on retry", async () => {
    const rec = createRecordingBackend();
    setMetricsBackend(rec);
    let t = 0;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("nope", {
          status: 429,
          headers: { "ratelimit-reset": "1", "ratelimit-remaining": "0" },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = createWareraClient({
      config: { ...baseConfig, wareraMaxRequestsPerMinute: 10_000 },
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async (ms) => {
        t += ms;
      },
      now: () => t,
    });
    await client.request("country.getAllCountries");
    const outcomes = rec.events
      .filter((e) => e.type === "count" && e.name === "warera.upstream.call")
      .map((e) => e.attrs?.outcome);
    expect(outcomes).toContain("rate_limited");
    expect(outcomes).toContain("ok");
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

  it("requestBatch accepts a single-slot object response for one item", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: { data: { _id: "m1", name: "Sweed Liberty" } } }), {
        status: 200,
      }),
    );
    const client = createWareraClient({
      config: { ...baseConfig, wareraMaxRequestsPerMinute: 10_000 },
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    const results = await client.requestBatch([{ procedure: "mu.getById", input: { muId: "m1" } }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("mu.getById?batch=1");
    const inputParam = new URLSearchParams(url.slice(url.indexOf("?") + 1)).get("input");
    expect(JSON.parse(inputParam!)).toEqual({ 0: { muId: "m1" } });
    expect(results).toEqual([{ ok: true, data: { _id: "m1", name: "Sweed Liberty" } }]);
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

  it("requestBatch joins duplicate slots onto one upstream slot", async () => {
    const rec = createRecordingBackend();
    setMetricsBackend(rec);
    let resolveFetch!: (value: Response) => void;
    const fetchMock = vi.fn(
      (..._args: Parameters<typeof fetch>) =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const client = createWareraClient({
      config: { ...baseConfig, wareraMaxRequestsPerMinute: 10_000 },
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });
    const item = { procedure: "user.getUserLite", input: { userId: "u1" } };

    const batch = client.requestBatch([item, item]);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toEqual(
      expect.stringContaining("user.getUserLite?batch=1"),
    );
    resolveFetch(
      new Response(JSON.stringify([{ result: { data: { username: "A" } } }]), {
        status: 200,
      }),
    );

    await expect(batch).resolves.toEqual([
      { ok: true, data: { username: "A" } },
      { ok: true, data: { username: "A" } },
    ]);
    expect(
      rec.events.some(
        (event) => event.type === "count" && event.name === "warera.upstream.dedup_join",
      ),
    ).toBe(true);
  });

  it("requestBatch joins a matching in-flight single", async () => {
    let resolveFetch!: (value: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const client = createWareraClient({
      config: { ...baseConfig, wareraMaxRequestsPerMinute: 10_000 },
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });
    const path = "user.getUserLite?input=%7B%22userId%22%3A%22u1%22%7D";

    const single = client.request(path);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const batch = client.requestBatch([{ procedure: "user.getUserLite", input: { userId: "u1" } }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(
      new Response(JSON.stringify({ result: { data: { username: "A" } } }), {
        status: 200,
      }),
    );

    await expect(single).resolves.toEqual({ result: { data: { username: "A" } } });
    await expect(batch).resolves.toEqual([{ ok: true, data: { username: "A" } }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    const items = Array.from({ length: 51 }, (_, index) => ({
      procedure: "a",
      input: { index },
    }));
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
        procedure: "v1/ping",
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
        procedure: "v1/ping",
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
