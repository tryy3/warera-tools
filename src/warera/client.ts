import type { AppConfig } from "../config/env";
import type { Logger } from "../logging/logger";
import { count, distribution, gauge } from "../metrics";
import { inferCallClass, type WareraCallClass } from "./call-class";
import { createInFlightDedup, dedupKey } from "./dedup";
import { createGovernor, parseRateLimitHeaders } from "./governor";
import {
  buildBatchInputRecord,
  chunkBatchItemsByMaxUrlLength,
  chunkBatchItemsByMaxSlots,
  parseTrpcBatchResponse,
  WARERA_MAX_BATCH_SLOTS,
  wareraBatchPath,
  wareraBatchPostPath,
  wareraProcedurePath,
  type TrpcBatchSlotResult,
  type WareraBatchItem,
} from "./trpc";

const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BODY_SNIPPET_LEN = 200;
/** Soft cap for tRPC batch GET URLs (split into multiple HTTP calls beyond this). */
export const WARERA_MAX_BATCH_URL_LENGTH = 2000;
export const WARERA_BATCH_WINDOW_MS = 400;
export const API2_TRPC_BASE = "https://api2.warera.io/trpc";

export type { TrpcBatchSlotResult, WareraBatchItem };

export type WareraAuthStyle = "auto" | "api-key" | "bearer";

export type WareraRequestInit = RequestInit & {
  skipRateLimit?: boolean;
  callClass?: WareraCallClass;
  /** JSON body — sets Content-Type and stringifies (for POST procedures). */
  json?: unknown;
  /**
   * Auth header style. `auto` = X-API-Key on gateway, Bearer on api2.
   * Some api2 procedures (e.g. getRecommendedRegionIdsByItemCode) require X-API-Key.
   */
  authStyle?: WareraAuthStyle;
  /** Force a specific tRPC base URL for this call. */
  baseUrl?: string;
};

function authHeaders(
  baseUrl: string,
  apiKey: string | undefined,
  authStyle: WareraAuthStyle = "auto",
): Headers {
  const headers = new Headers();
  if (!apiKey) return headers;
  const useApiKey =
    authStyle === "api-key" || (authStyle === "auto" && baseUrl.includes("gateway.warerastats.io"));
  if (useApiKey) {
    headers.set("X-API-Key", apiKey);
  } else {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }
  return headers;
}

export type CreateWareraClientOptions = {
  config: AppConfig;
  logger: Logger;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

class WareraRequestError extends Error {
  readonly status: number | undefined;
  readonly outcome: "rate_limited" | "http_error";
  readonly byteLength: number;
  readonly headers: Headers | undefined;

  constructor(
    message: string,
    status: number | undefined,
    outcome: "rate_limited" | "http_error",
    byteLength = 0,
    headers?: Headers,
  ) {
    super(message);
    this.status = status;
    this.outcome = outcome;
    this.byteLength = byteLength;
    this.headers = headers;
  }
}

type RequestOutcome = "ok" | "rate_limited" | "http_error" | "network_error";

function procedureFromPath(path: string): string {
  return path.split("?")[0]!.replace(/^\//, "");
}

function inputFromPath(path: string): unknown {
  const queryIndex = path.indexOf("?");
  if (queryIndex === -1) return undefined;
  const input = new URLSearchParams(path.slice(queryIndex + 1)).get("input");
  return input === null ? undefined : JSON.parse(input);
}

function isBatchPost(method: string, path: string): boolean {
  if (method !== "POST") return false;
  const queryIndex = path.indexOf("?");
  if (queryIndex === -1) return false;
  return new URLSearchParams(path.slice(queryIndex + 1)).get("batch") === "1";
}

function canRetry(
  method: string,
  path: string,
  status: number | undefined,
  is429: boolean,
): boolean {
  if (is429) return true;
  const idempotent = method === "GET" || isBatchPost(method, path);
  if (!idempotent) return false;
  if (status === undefined) return true;
  return RETRYABLE_STATUSES.has(status);
}

function joinUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

export function createWareraClient(options: CreateWareraClientOptions) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = options.now ?? (() => Date.now());
  const governor = createGovernor({
    maxPerMinute: options.config.wareraMaxRequestsPerMinute,
    now,
    sleep,
  });
  const inFlightDedup = createInFlightDedup();
  const requestInitObjectIds = new WeakMap<object, number>();
  let nextRequestInitObjectId = 1;

  function requestInitObjectId(value: object): number {
    const existing = requestInitObjectIds.get(value);
    if (existing !== undefined) return existing;
    const id = nextRequestInitObjectId++;
    requestInitObjectIds.set(value, id);
    return id;
  }

  function requestInitGroupKey(init: RequestInit): string {
    const headers = [...new Headers(init.headers).entries()].toSorted(([a], [b]) =>
      a.localeCompare(b),
    );
    const fields = Object.entries(init)
      .filter(([key]) => key !== "headers" && key !== "method")
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [
        key,
        value !== null && (typeof value === "object" || typeof value === "function")
          ? { objectId: requestInitObjectId(value) }
          : value,
      ]);
    return JSON.stringify({ headers, fields });
  }

  type QueuedRequest = {
    item: WareraBatchItem;
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
    authStyle: WareraAuthStyle;
    baseUrl: string;
    callClass: WareraCallClass;
    fetchInit: RequestInit;
    fetchInitGroupKey: string;
  };
  let queue: QueuedRequest[] = [];
  let timer: Promise<void> | null = null;

  async function requestOnce(
    baseUrl: string,
    path: string,
    fetchInit: RequestInit,
    method: string,
    authStyle: WareraAuthStyle,
  ): Promise<
    | { ok: true; json: unknown; status: number; headers: Headers }
    | { ok: false; status: number; bodyText: string; headers: Headers }
  > {
    const url = joinUrl(baseUrl, path);
    const headers = new Headers(fetchInit.headers);
    const auth = authHeaders(baseUrl, options.config.wareraApiKey, authStyle);
    auth.forEach((value, key) => headers.set(key, value));

    const response = await fetchImpl(url, { ...fetchInit, method, headers });
    governor.recordHeaders(response.headers);
    if (response.ok) {
      let bodyText = "";
      try {
        bodyText = await response.text();
        const json: unknown = JSON.parse(bodyText);
        return {
          ok: true,
          json,
          status: response.status,
          headers: response.headers,
        };
      } catch {
        throw new WareraRequestError(
          `WarEra response JSON parse failed: HTTP ${response.status}`,
          response.status,
          "http_error",
          bodyText.length,
          response.headers,
        );
      }
    }
    if (response.status === 429) {
      governor.note429(response.headers);
      let bodyText = "";
      try {
        bodyText = await response.text();
      } catch {
        throw new WareraRequestError(
          "WarEra request failed: 429 (body read failed)",
          response.status,
          "rate_limited",
          0,
          response.headers,
        );
      }
      throw new WareraRequestError(
        `WarEra request failed: 429 ${bodyText.slice(0, BODY_SNIPPET_LEN)}`.trim(),
        response.status,
        "rate_limited",
        bodyText.length,
        response.headers,
      );
    }
    const bodyText = await response.text();
    return { ok: false, status: response.status, bodyText, headers: response.headers };
  }

  async function executeRequest(
    path: string,
    fetchInit: RequestInit,
    method: string,
    authStyle: WareraAuthStyle,
    skipRateLimit: boolean,
    baseUrlOverride: string | undefined,
    callClass: WareraCallClass,
    procedures: string[],
  ): Promise<unknown> {
    const baseUrl = baseUrlOverride ?? options.config.wareraApiBaseUrl;
    const procedure = procedureFromPath(path);

    function emitAttempt(
      outcome: RequestOutcome,
      durationMs: number,
      byteLength: number,
      status: number | undefined,
      headers: Headers | undefined,
    ): void {
      for (const slotProcedure of procedures) {
        count("warera.upstream.call", 1, {
          procedure: slotProcedure,
          call_class: callClass,
          outcome,
        });
      }
      distribution(
        "warera.upstream.latency_ms",
        durationMs,
        { call_class: callClass, outcome },
        "millisecond",
      );
      distribution("warera.upstream.batch_size", procedures.length, { call_class: callClass });
      distribution("warera.upstream.response_bytes", byteLength, { call_class: callClass });

      const parsedHeaders = headers === undefined ? null : parseRateLimitHeaders(headers);
      if (parsedHeaders?.remaining !== null && parsedHeaders?.remaining !== undefined) {
        gauge("warera.upstream.rate_limit_remaining", parsedHeaders.remaining);
      }

      options.logger.debug(
        {
          procedure,
          call_class: callClass,
          status,
          durationMs,
          outcome,
          ...(parsedHeaders?.remaining == null
            ? {}
            : { ratelimit_remaining: parsedHeaders.remaining }),
          ...(parsedHeaders?.resetSeconds == null
            ? {}
            : { ratelimit_reset: parsedHeaders.resetSeconds }),
        },
        "warera request",
      );
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const acquire = await governor.acquire({ skipLocal: skipRateLimit });
      if (acquire.waitMs > 0 && acquire.reason !== null) {
        distribution("warera.upstream.rate_limit_wait_ms", acquire.waitMs, {
          reason: acquire.reason,
        });
      }

      const started = now();
      try {
        const response = await requestOnce(baseUrl, path, fetchInit, method, authStyle);
        const durationMs = now() - started;

        if (response.ok) {
          emitAttempt(
            "ok",
            durationMs,
            JSON.stringify(response.json).length,
            response.status,
            response.headers,
          );
          return response.json;
        }

        const bodySnippet = response.bodyText.slice(0, BODY_SNIPPET_LEN);
        throw new WareraRequestError(
          `WarEra request failed: ${response.status} ${bodySnippet}`.trim(),
          response.status,
          "http_error",
          response.bodyText.length,
          response.headers,
        );
      } catch (err) {
        const durationMs = now() - started;
        const requestError = err instanceof WareraRequestError ? err : null;
        const outcome = requestError?.outcome ?? "network_error";
        emitAttempt(
          outcome,
          durationMs,
          requestError?.byteLength ?? 0,
          requestError?.status,
          requestError?.headers,
        );
        const is429 = outcome === "rate_limited";
        if (attempt >= MAX_RETRIES || !canRetry(method, path, requestError?.status, is429)) {
          throw err;
        }
        if (!is429) {
          const backoffMs = Math.min(5000, 250 * 2 ** attempt) + Math.random() * 250;
          await sleep(backoffMs);
        }
      }
    }

    throw new Error("WarEra request retry loop exhausted");
  }

  async function flushQueue(): Promise<void> {
    const pending = queue;
    queue = [];
    const groups = new Map<string, QueuedRequest[]>();
    for (const queued of pending) {
      const key = JSON.stringify([
        "GET",
        queued.authStyle,
        queued.baseUrl,
        queued.fetchInitGroupKey,
      ]);
      const group = groups.get(key);
      if (group) {
        group.push(queued);
      } else {
        groups.set(key, [queued]);
      }
    }

    await Promise.all(
      [...groups.values()].map(async (group) => {
        const first = group[0]!;
        try {
          if (group.length === 1) {
            const result = await executeRequest(
              wareraProcedurePath(first.item.procedure, first.item.input),
              first.fetchInit,
              "GET",
              first.authStyle,
              false,
              first.baseUrl,
              first.callClass,
              [first.item.procedure],
            );
            first.resolve(result);
            return;
          }

          const slots = await executeBatchItems(
            group.map((queued) => queued.item),
            {
              ...first.fetchInit,
              authStyle: first.authStyle,
              baseUrl: first.baseUrl,
              callClass: first.callClass,
            },
          );
          for (let index = 0; index < group.length; index++) {
            const queued = group[index]!;
            const slot = slots[index];
            if (slot?.ok) {
              queued.resolve({ result: { data: slot.data } });
            } else {
              queued.resolve({ error: slot?.error });
            }
          }
        } catch (error) {
          for (const queued of group) {
            queued.reject(error);
          }
        }
      }),
    );
  }

  function enqueueBackgroundRequest(
    item: WareraBatchItem,
    authStyle: WareraAuthStyle,
    baseUrl: string,
    callClass: WareraCallClass,
    fetchInit: RequestInit,
  ): Promise<unknown> {
    const promise = new Promise<unknown>((resolve, reject) => {
      queue.push({
        item,
        resolve,
        reject,
        authStyle,
        baseUrl,
        callClass,
        fetchInit,
        fetchInitGroupKey: requestInitGroupKey(fetchInit),
      });
    });
    if (timer === null) {
      timer = sleep(WARERA_BATCH_WINDOW_MS).then(async () => {
        timer = null;
        await flushQueue();
      });
    }
    return promise;
  }

  async function request<T>(path: string, init: WareraRequestInit = {}): Promise<T> {
    const {
      skipRateLimit,
      callClass: callClassOverride,
      json,
      authStyle = "auto",
      baseUrl: baseUrlOverride,
      ...rest
    } = init;
    const method = (rest.method ?? (json !== undefined ? "POST" : "GET")).toUpperCase();
    const callClass = inferCallClass(callClassOverride);
    const fetchInit: RequestInit = { ...rest };
    if (json !== undefined) {
      fetchInit.body = JSON.stringify(json);
      const headers = new Headers(fetchInit.headers);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
      fetchInit.headers = headers;
    }

    const procedure = procedureFromPath(path);
    const resolvedBaseUrl = baseUrlOverride ?? options.config.wareraApiBaseUrl;
    if (method === "GET" && json === undefined) {
      const input = inputFromPath(path);
      const { joined, promise } = inFlightDedup.join(
        `${dedupKey({
          method,
          procedure,
          input,
          authStyle,
          baseUrl: resolvedBaseUrl,
        })}\0${requestInitGroupKey(fetchInit)}`,
        () =>
          callClass === "background" && !skipRateLimit
            ? enqueueBackgroundRequest(
                { procedure, input },
                authStyle,
                resolvedBaseUrl,
                callClass,
                fetchInit,
              )
            : executeRequest(
                path,
                fetchInit,
                method,
                authStyle,
                Boolean(skipRateLimit),
                baseUrlOverride,
                callClass,
                [procedure],
              ),
      );
      if (joined) {
        count("warera.upstream.dedup_join", 1, {
          procedure,
          call_class: callClass,
        });
      }
      return (await promise) as T;
    }

    return (await executeRequest(
      path,
      fetchInit,
      method,
      authStyle,
      Boolean(skipRateLimit),
      baseUrlOverride,
      callClass,
      [procedure],
    )) as T;
  }

  async function executeBatchItems(
    items: WareraBatchItem[],
    init: WareraRequestInit = {},
  ): Promise<TrpcBatchSlotResult[]> {
    if (items.length === 0) return [];

    const {
      skipRateLimit,
      callClass: callClassOverride,
      authStyle = "auto",
      baseUrl: baseUrlOverride,
      json: _json,
      ...rest
    } = init;
    const method = (rest.method ?? "GET").toUpperCase();
    const isPost = method === "POST";
    const callClass = inferCallClass(callClassOverride);

    const out: TrpcBatchSlotResult[] = [];

    const slotChunks = chunkBatchItemsByMaxSlots(items, WARERA_MAX_BATCH_SLOTS);
    for (const slotChunk of slotChunks) {
      const urlChunks = chunkBatchItemsByMaxUrlLength(
        slotChunk,
        WARERA_MAX_BATCH_URL_LENGTH,
        isPost ? wareraBatchPostPath : wareraBatchPath,
      );
      for (const chunk of urlChunks) {
        const path = isPost ? wareraBatchPostPath(chunk) : wareraBatchPath(chunk);
        const fetchInit: RequestInit = { ...rest };
        if (isPost) {
          fetchInit.body = JSON.stringify(buildBatchInputRecord(chunk));
          const headers = new Headers(fetchInit.headers);
          if (!headers.has("content-type")) {
            headers.set("content-type", "application/json");
          }
          fetchInit.headers = headers;
        }
        const json = await executeRequest(
          path,
          fetchInit,
          method,
          authStyle,
          Boolean(skipRateLimit),
          baseUrlOverride,
          callClass,
          chunk.map((item) => item.procedure),
        );
        out.push(...parseTrpcBatchResponse(json));
      }
    }

    return out;
  }

  async function requestBatch(
    items: WareraBatchItem[],
    init: WareraRequestInit = {},
  ): Promise<TrpcBatchSlotResult[]> {
    if (items.length === 0) return [];

    const {
      skipRateLimit: _skipRateLimit,
      callClass: callClassOverride,
      authStyle = "auto",
      baseUrl: baseUrlOverride,
      json: _json,
      ...rest
    } = init;
    const method = (rest.method ?? "GET").toUpperCase();
    const callClass = inferCallClass(callClassOverride);
    const resolvedBaseUrl = baseUrlOverride ?? options.config.wareraApiBaseUrl;
    const initGroupKey = requestInitGroupKey(rest);
    type Leader = {
      item: WareraBatchItem;
      resolve: (value: unknown) => void;
      reject: (reason: unknown) => void;
    };
    const leaders: Leader[] = [];

    const slotPromises = items.map((item) => {
      let resolve!: (value: unknown) => void;
      let reject!: (reason: unknown) => void;
      const deferred = new Promise<unknown>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      const { joined, promise } = inFlightDedup.join(
        `${dedupKey({
          method,
          procedure: item.procedure,
          input: item.input,
          authStyle,
          baseUrl: resolvedBaseUrl,
        })}\0${initGroupKey}`,
        () => deferred,
      );
      if (joined) {
        count("warera.upstream.dedup_join", 1, {
          procedure: item.procedure,
          call_class: callClass,
        });
      } else {
        leaders.push({ item, resolve, reject });
      }
      return promise;
    });

    if (leaders.length > 0) {
      try {
        const leaderSlots = await executeBatchItems(
          leaders.map((leader) => leader.item),
          init,
        );
        for (let index = 0; index < leaders.length; index++) {
          const leader = leaders[index]!;
          const slot = leaderSlots[index];
          leader.resolve(slot?.ok ? { result: { data: slot.data } } : { error: slot?.error });
        }
      } catch (error) {
        for (const leader of leaders) leader.reject(error);
      }
    }

    return parseTrpcBatchResponse(await Promise.all(slotPromises));
  }

  return { request, requestBatch };
}
