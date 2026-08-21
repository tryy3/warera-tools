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
  type HeaderPauseResult = {
    waitMs: number;
    reason: Exclude<RateLimitWaitReason, "local_budget">;
  };
  let pausePromise: Promise<HeaderPauseResult> | null = null;
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

  function getHeaderPause() {
    if (pausePromise !== null) return pausePromise;
    if (remaining === null || remaining > 0 || resetAt === null) return null;

    const reason: HeaderPauseResult["reason"] = last429 ? "http_429" : "header_exhausted";
    const run = (async () => {
      let waitMs = 0;
      let observedResetAt: number | null = null;
      let deadline = 0;

      for (;;) {
        if (remaining === null || remaining > 0 || resetAt === null) {
          last429 = false;
          return { waitMs, reason };
        }
        if (resetAt !== observedResetAt) {
          observedResetAt = resetAt;
          deadline = resetAt + jitter();
        }

        const nextWaitMs = Math.max(0, deadline - now());
        if (nextWaitMs > 0) {
          waitMs += nextWaitMs;
          await sleep(nextWaitMs);
          continue;
        }

        remaining = null;
        resetAt = null;
        last429 = false;
        return { waitMs, reason };
      }
    })();
    let sharedPause!: Promise<HeaderPauseResult>;
    sharedPause = run.finally(() => {
      if (pausePromise === sharedPause) pausePromise = null;
    });
    pausePromise = sharedPause;
    return sharedPause;
  }

  async function acquire(
    opts: { skipLocal?: boolean } = {},
  ): Promise<{ waitMs: number; reason: RateLimitWaitReason | null }> {
    const headerWait = await getHeaderPause();
    let acquiredLocalWaitMs = 0;
    const run = acquireChain.then(async () => {
      localWaitMs = 0;
      if (!opts.skipLocal) await rateLimiter.acquire();
      acquiredLocalWaitMs = localWaitMs;
    });
    acquireChain = run.catch(() => {});
    await run;

    return {
      waitMs: (headerWait?.waitMs ?? 0) + acquiredLocalWaitMs,
      reason: headerWait?.reason ?? (acquiredLocalWaitMs > 0 ? "local_budget" : null),
    };
  }

  return { acquire, recordHeaders, note429 };
}
