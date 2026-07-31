import type { AppConfig } from "../config/env";
import type { Logger } from "../logging/logger";
import { createRateLimiter } from "./rate-limit";

const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const MAX_RETRIES = 2;
const BODY_SNIPPET_LEN = 200;

export type WareraRequestInit = RequestInit & { skipRateLimit?: boolean };

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

  async function request<T>(path: string, init: WareraRequestInit = {}): Promise<T> {
    const { skipRateLimit, ...fetchInit } = init;
    const method = (fetchInit.method ?? "GET").toUpperCase();
    const url = joinUrl(options.config.wareraApiBaseUrl, path);

    const headers = new Headers(fetchInit.headers);
    if (options.config.wareraApiKey) {
      // Gateway requires X-API-Key; official api2 uses Bearer session tokens.
      const isGateway = options.config.wareraApiBaseUrl.includes("gateway.warerastats.io");
      if (isGateway) {
        headers.set("X-API-Key", options.config.wareraApiKey);
      } else {
        headers.set("Authorization", `Bearer ${options.config.wareraApiKey}`);
      }
    }

    let lastError: unknown;
    let lastStatus: number | undefined;
    let lastBodySnippet = "";

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (!skipRateLimit) {
        await acquireSerialized();
      }

      const started = now();
      try {
        const response = await fetchImpl(url, { ...fetchInit, method, headers });
        const durationMs = now() - started;
        options.logger.info({ path, status: response.status, durationMs }, "warera request");

        if (response.ok) {
          return (await response.json()) as T;
        }

        const bodyText = await response.text();
        lastStatus = response.status;
        lastBodySnippet = bodyText.slice(0, BODY_SNIPPET_LEN);
        lastError = new Error(
          `WarEra request failed: ${response.status} ${lastBodySnippet}`.trim(),
        );

        const canRetry =
          isRetryableMethod(method) &&
          RETRYABLE_STATUSES.has(response.status) &&
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
        options.logger.info({ path, status: undefined, durationMs }, "warera request");
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

  return { request };
}
