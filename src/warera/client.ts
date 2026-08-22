import type { AppConfig } from "../config/env";
import type { Logger } from "../logging/logger";
import { createGovernor } from "./governor";
import {
  buildBatchInputRecord,
  chunkBatchItemsByMaxUrlLength,
  chunkBatchItemsByMaxSlots,
  parseTrpcBatchResponse,
  WARERA_MAX_BATCH_SLOTS,
  wareraBatchPath,
  wareraBatchPostPath,
  type TrpcBatchSlotResult,
  type WareraBatchItem,
} from "./trpc";

const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BODY_SNIPPET_LEN = 200;
/** Soft cap for tRPC batch GET URLs (split into multiple HTTP calls beyond this). */
export const WARERA_MAX_BATCH_URL_LENGTH = 2000;
export const API2_TRPC_BASE = "https://api2.warera.io/trpc";

export type { TrpcBatchSlotResult, WareraBatchItem };

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

class WareraRequestError extends Error {
  readonly status: number | undefined;
  readonly outcome: "rate_limited" | "http_error";

  constructor(message: string, status: number | undefined, outcome: "rate_limited" | "http_error") {
    super(message);
    this.status = status;
    this.outcome = outcome;
  }
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
  let governorNow = now();
  const governor = createGovernor({
    maxPerMinute: options.config.wareraMaxRequestsPerMinute,
    now: () => Math.max(now(), governorNow),
    sleep: async (ms) => {
      await sleep(ms);
      governorNow = Math.max(now(), governorNow + ms);
    },
  });

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
      let json: unknown;
      try {
        json = await response.json();
      } catch {
        throw new WareraRequestError(
          `WarEra response JSON parse failed: HTTP ${response.status}`,
          response.status,
          "http_error",
        );
      }
      return {
        ok: true,
        json,
        status: response.status,
        headers: response.headers,
      };
    }
    const bodyText = await response.text();
    if (response.status === 429) {
      governor.note429(response.headers);
      throw new WareraRequestError(
        `WarEra request failed: 429 ${bodyText.slice(0, BODY_SNIPPET_LEN)}`.trim(),
        response.status,
        "rate_limited",
      );
    }
    return { ok: false, status: response.status, bodyText, headers: response.headers };
  }

  async function executeRequest(
    path: string,
    fetchInit: RequestInit,
    method: string,
    authStyle: WareraAuthStyle,
    skipRateLimit: boolean,
    baseUrlOverride: string | undefined,
  ): Promise<unknown> {
    const baseUrl = baseUrlOverride ?? options.config.wareraApiBaseUrl;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await governor.acquire({ skipLocal: skipRateLimit });

      const started = now();
      try {
        const response = await requestOnce(baseUrl, path, fetchInit, method, authStyle);
        const durationMs = now() - started;

        if (response.ok) {
          options.logger.debug(
            { path, status: response.status, durationMs, outcome: "ok" },
            "warera request",
          );
          return response.json;
        }

        const bodySnippet = response.bodyText.slice(0, BODY_SNIPPET_LEN);
        throw new WareraRequestError(
          `WarEra request failed: ${response.status} ${bodySnippet}`.trim(),
          response.status,
          "http_error",
        );
      } catch (err) {
        const durationMs = now() - started;
        const requestError = err instanceof WareraRequestError ? err : null;
        const outcome = requestError?.outcome ?? "network_error";
        options.logger.debug(
          { path, status: requestError?.status, durationMs, outcome },
          "warera request",
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
    const method = (init.method ?? "GET").toUpperCase();
    const isPost = method === "POST";

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
        const fetchInit: RequestInit = isPost
          ? {
              body: JSON.stringify(buildBatchInputRecord(chunk)),
              headers: { "content-type": "application/json" },
            }
          : {};
        const json = await executeRequest(
          path,
          fetchInit,
          method,
          authStyle,
          Boolean(skipRateLimit),
          baseUrlOverride,
        );
        out.push(...parseTrpcBatchResponse(json));
      }
    }

    return out;
  }

  return { request, requestBatch };
}
