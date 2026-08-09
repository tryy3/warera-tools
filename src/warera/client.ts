import type { AppConfig } from "../config/env";
import type { Logger } from "../logging/logger";
import { createRateLimiter } from "./rate-limit";
import {
  chunkBatchItemsByMaxUrlLength,
  parseTrpcBatchResponse,
  wareraBatchPath,
  type TrpcBatchSlotResult,
  type WareraBatchItem,
} from "./trpc";

const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const MAX_RETRIES = 2;
const BODY_SNIPPET_LEN = 200;
/** Soft cap for tRPC batch GET URLs (split into multiple HTTP calls beyond this). */
export const WARERA_MAX_BATCH_URL_LENGTH = 2000;
export const API2_TRPC_BASE = "https://api2.warera.io/trpc";

export type { TrpcBatchSlotResult, WareraBatchItem };

function isUnknownMethodBody(body: string): boolean {
  return /unknown method/i.test(body);
}

export type WareraAuthStyle = "auto" | "api-key" | "bearer";

export type WareraRequestInit = RequestInit & {
  skipRateLimit?: boolean;
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

function isRetryableMethod(method: string): boolean {
  return method === "GET";
}

function joinUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

export function createWareraClient(options: CreateWareraClientOptions) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = options.now ?? (() => Date.now());
  const rateLimiter = createRateLimiter({
    maxPerMinute: options.config.wareraMaxRequestsPerMinute,
    now,
    sleep,
  });

  // Serialize acquire so concurrent request() calls cannot race past maxPerMinute
  // (createRateLimiter itself is not concurrency-safe).
  let acquireChain: Promise<void> = Promise.resolve();
  function acquireSerialized(): Promise<void> {
    const run = acquireChain.then(() => rateLimiter.acquire());
    acquireChain = run.catch(() => {});
    return run;
  }

  async function requestOnce(
    baseUrl: string,
    path: string,
    fetchInit: RequestInit,
    method: string,
    authStyle: WareraAuthStyle,
  ): Promise<{ ok: true; json: unknown } | { ok: false; status: number; bodyText: string }> {
    const url = joinUrl(baseUrl, path);
    const headers = new Headers(fetchInit.headers);
    const auth = authHeaders(baseUrl, options.config.wareraApiKey, authStyle);
    auth.forEach((value, key) => headers.set(key, value));

    const response = await fetchImpl(url, { ...fetchInit, method, headers });
    if (response.ok) {
      return { ok: true, json: await response.json() };
    }
    const bodyText = await response.text();
    return { ok: false, status: response.status, bodyText };
  }

  async function executeRequest(
    path: string,
    fetchInit: RequestInit,
    method: string,
    authStyle: WareraAuthStyle,
    skipRateLimit: boolean,
    baseUrlOverride: string | undefined,
  ): Promise<unknown> {
    const primaryBase = baseUrlOverride ?? options.config.wareraApiBaseUrl;
    const canFallbackToApi2 =
      !baseUrlOverride &&
      primaryBase.includes("gateway.warerastats.io") &&
      !primaryBase.includes("api2.warera.io");

    let lastError: unknown;
    let lastStatus: number | undefined;
    let lastBodySnippet = "";

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (!skipRateLimit) {
        await acquireSerialized();
      }

      const started = now();
      try {
        const primary = await requestOnce(primaryBase, path, fetchInit, method, authStyle);
        const durationMs = now() - started;

        if (primary.ok) {
          options.logger.debug({ path, status: 200, durationMs }, "warera request");
          return primary.json;
        }

        // Gateway may not mirror every api2 procedure — retry once on official API.
        if (
          canFallbackToApi2 &&
          (primary.status === 404 ||
            (primary.status === 400 && isUnknownMethodBody(primary.bodyText)))
        ) {
          options.logger.debug(
            { path, status: primary.status, durationMs },
            "warera request (gateway miss; trying api2)",
          );
          if (!skipRateLimit) {
            await acquireSerialized();
          }
          const fallbackStarted = now();
          const fallback = await requestOnce(API2_TRPC_BASE, path, fetchInit, method, authStyle);
          const fallbackMs = now() - fallbackStarted;
          if (fallback.ok) {
            options.logger.debug(
              { path, status: 200, durationMs: fallbackMs, via: "api2" },
              "warera request",
            );
            return fallback.json;
          }
          lastStatus = fallback.status;
          lastBodySnippet = fallback.bodyText.slice(0, BODY_SNIPPET_LEN);
          lastError = new Error(
            `WarEra request failed: ${fallback.status} ${lastBodySnippet}`.trim(),
          );
          options.logger.debug(
            { path, status: fallback.status, durationMs: fallbackMs, via: "api2" },
            "warera request",
          );
          throw lastError;
        }

        lastStatus = primary.status;
        lastBodySnippet = primary.bodyText.slice(0, BODY_SNIPPET_LEN);
        lastError = new Error(`WarEra request failed: ${primary.status} ${lastBodySnippet}`.trim());
        options.logger.debug({ path, status: primary.status, durationMs }, "warera request");

        const canRetry =
          isRetryableMethod(method) &&
          RETRYABLE_STATUSES.has(primary.status) &&
          attempt < MAX_RETRIES;
        if (!canRetry) {
          throw lastError;
        }
        await sleep(0);
      } catch (err) {
        if (err === lastError) {
          throw err;
        }
        const durationMs = now() - started;
        options.logger.debug({ path, status: undefined, durationMs }, "warera request");
        lastError = err;
        const canRetry = isRetryableMethod(method) && attempt < MAX_RETRIES;
        if (!canRetry) {
          throw err;
        }
        await sleep(0);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`WarEra request failed: ${lastStatus ?? "unknown"} ${lastBodySnippet}`.trim());
  }

  async function request<T>(path: string, init: WareraRequestInit = {}): Promise<T> {
    const { skipRateLimit, json, authStyle = "auto", baseUrl: baseUrlOverride, ...rest } = init;
    const method = (rest.method ?? (json !== undefined ? "POST" : "GET")).toUpperCase();
    const fetchInit: RequestInit = { ...rest };
    if (json !== undefined) {
      fetchInit.body = JSON.stringify(json);
      const headers = new Headers(fetchInit.headers);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
      fetchInit.headers = headers;
    }

    return (await executeRequest(
      path,
      fetchInit,
      method,
      authStyle,
      Boolean(skipRateLimit),
      baseUrlOverride,
    )) as T;
  }

  async function requestBatch(
    items: WareraBatchItem[],
    init: WareraRequestInit = {},
  ): Promise<TrpcBatchSlotResult[]> {
    if (items.length === 0) return [];

    const { skipRateLimit, authStyle = "auto", baseUrl: baseUrlOverride } = init;
    const chunks = chunkBatchItemsByMaxUrlLength(items, WARERA_MAX_BATCH_URL_LENGTH);
    const out: TrpcBatchSlotResult[] = [];

    for (const chunk of chunks) {
      const path = wareraBatchPath(chunk);
      const json = await executeRequest(
        path,
        {},
        "GET",
        authStyle,
        Boolean(skipRateLimit),
        baseUrlOverride,
      );
      out.push(...parseTrpcBatchResponse(json));
    }

    return out;
  }

  return { request, requestBatch };
}
