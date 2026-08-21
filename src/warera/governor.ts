import { createRateLimiter } from "./rate-limit";

export type RateLimitWaitReason = "local_budget" | "header_exhausted" | "http_429";

export type ParsedRateLimitHeaders = {
  limit: number | null;
  remaining: number | null;
  resetSeconds: number | null;
  retryAfterSeconds: number | null;
};

export type GovernorOptions = {
  maxPerMinute: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  jitter?: () => number;
};

function parseNumber(value: string | null, parser: (value: string) => number): number | null {
  if (value === null) return null;
  const parsed = parser(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseRateLimitHeaders(headers: Headers): ParsedRateLimitHeaders {
  return {
    limit: parseNumber(headers.get("ratelimit-limit"), Number),
    remaining: parseNumber(headers.get("ratelimit-remaining"), Number),
    resetSeconds: parseNumber(headers.get("ratelimit-reset"), Number.parseFloat),
    retryAfterSeconds: parseNumber(headers.get("retry-after"), Number.parseFloat),
  };
}

export function createGovernor(options: GovernorOptions) {
  const now = options.now ?? (() => Date.now());
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const jitter = options.jitter ?? (() => 10 + Math.random() * 490);

  let localWaitMs = 0;
  const rateLimiter = createRateLimiter({
    maxPerMinute: options.maxPerMinute,
    now,
    sleep: async (ms) => {
      localWaitMs += ms;
      await sleep(ms);
    },
  });

  let limit: number | null = null;
  let remaining: number | null = null;
  let resetAt: number | null = null;
  let last429 = false;
  let pausePromise: Promise<void> | null = null;
  let acquireChain: Promise<void> = Promise.resolve();

  function recordHeaders(headers: Headers): void {
    const parsed = parseRateLimitHeaders(headers);
    if (parsed.limit !== null && parsed.limit !== limit) limit = parsed.limit;
    if (parsed.remaining !== null) remaining = parsed.remaining;
    if (parsed.resetSeconds !== null) resetAt = now() + parsed.resetSeconds * 1000;
  }

  function note429(headers: Headers): void {
    const parsed = parseRateLimitHeaders(headers);
    recordHeaders(headers);
    remaining = 0;
    last429 = true;
    if (parsed.retryAfterSeconds !== null) {
      resetAt = now() + parsed.retryAfterSeconds * 1000;
    } else if (parsed.resetSeconds === null) {
      resetAt = now() + 1000;
    }
  }

  async function acquireUnserialized(
    opts: { skipLocal?: boolean } = {},
  ): Promise<{ waitMs: number; reason: RateLimitWaitReason | null }> {
    let headerWaitMs = 0;
    let headerReason: RateLimitWaitReason | null = null;

    if (remaining !== null && remaining <= 0 && resetAt !== null) {
      headerReason = last429 ? "http_429" : "header_exhausted";
      headerWaitMs = Math.max(0, resetAt + jitter() - now());

      if (pausePromise === null) {
        pausePromise = (async () => {
          if (headerWaitMs > 0) await sleep(headerWaitMs);
          if (remaining !== null && remaining <= 0) {
            remaining = null;
            resetAt = null;
            last429 = false;
          }
        })().finally(() => {
          pausePromise = null;
        });
      }
      await pausePromise;
    }

    localWaitMs = 0;
    if (!opts.skipLocal) await rateLimiter.acquire();

    return {
      waitMs: headerWaitMs + localWaitMs,
      reason: headerReason ?? (localWaitMs > 0 ? "local_budget" : null),
    };
  }

  function acquire(
    opts: { skipLocal?: boolean } = {},
  ): Promise<{ waitMs: number; reason: RateLimitWaitReason | null }> {
    let result!: { waitMs: number; reason: RateLimitWaitReason | null };
    const run = acquireChain.then(async () => {
      result = await acquireUnserialized(opts);
    });
    acquireChain = run.catch(() => {});
    return run.then(() => result);
  }

  return { acquire, recordHeaders, note429 };
}
