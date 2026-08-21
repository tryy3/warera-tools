import { describe, expect, it, vi } from "vite-plus/test";
import { createGovernor, parseRateLimitHeaders } from "./governor";

describe("parseRateLimitHeaders", () => {
  it("reads ratelimit-* and Retry-After case-insensitively", () => {
    const headers = new Headers({
      "RateLimit-Limit": "500",
      "ratelimit-remaining": "499",
      "ratelimit-reset": "60",
      "Retry-After": "12",
    });
    expect(parseRateLimitHeaders(headers)).toEqual({
      limit: 500,
      remaining: 499,
      resetSeconds: 60,
      retryAfterSeconds: 12,
    });
  });

  it("returns nulls when headers are missing or invalid", () => {
    expect(parseRateLimitHeaders(new Headers({ "ratelimit-remaining": "nope" }))).toEqual({
      limit: null,
      remaining: null,
      resetSeconds: null,
      retryAfterSeconds: null,
    });
  });
});

describe("createGovernor", () => {
  it("waits when remaining is 0 until resetAt", async () => {
    const sleep = vi.fn(async (ms: number) => {
      t += ms;
    });
    let t = 1_000;
    const g = createGovernor({
      maxPerMinute: 1000,
      now: () => t,
      sleep,
      jitter: () => 0,
    });
    g.recordHeaders(
      new Headers({
        "ratelimit-remaining": "0",
        "ratelimit-reset": "2",
      }),
    );
    const result = await g.acquire();
    expect(result.reason).toBe("header_exhausted");
    expect(result.waitMs).toBe(2000);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("note429 uses Retry-After over ratelimit-reset and pauses a second acquire", async () => {
    const sleep = vi.fn(async (ms: number) => {
      t += ms;
    });
    let t = 0;
    const g = createGovernor({
      maxPerMinute: 1000,
      now: () => t,
      sleep,
      jitter: () => 0,
    });
    g.note429(
      new Headers({
        "ratelimit-reset": "60",
        "Retry-After": "3",
      }),
    );
    const a = await g.acquire();
    expect(a.reason).toBe("http_429");
    expect(a.waitMs).toBe(3000);
  });

  it("keeps waiting when note429 extends an active header pause", async () => {
    const sleeps: Array<{ ms: number; resolve: () => void }> = [];
    const sleep = vi.fn(
      (ms: number) =>
        new Promise<void>((resolve) => {
          sleeps.push({ ms, resolve });
        }),
    );
    let t = 0;
    const g = createGovernor({
      maxPerMinute: 1000,
      now: () => t,
      sleep,
      jitter: () => 0,
    });
    g.recordHeaders(new Headers({ "ratelimit-remaining": "0", "ratelimit-reset": "1" }));

    const acquire = g.acquire();
    await vi.waitFor(() => expect(sleep).toHaveBeenCalledTimes(1));
    expect(sleeps[0]?.ms).toBe(1000);

    t = 1000;
    g.note429(new Headers({ "Retry-After": "3" }));
    sleeps[0]?.resolve();
    await vi.waitFor(() => expect(sleep).toHaveBeenCalledTimes(2));
    expect(sleeps[1]?.ms).toBe(3000);

    t = 4000;
    sleeps[1]?.resolve();
    const result = await acquire;
    expect(result.reason).toBe("header_exhausted");
    expect(result.waitMs).toBe(4000);
  });

  it("shares one reported header wait between concurrent acquires", async () => {
    let resolveSleep!: () => void;
    const sleep = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSleep = resolve;
        }),
    );
    let t = 0;
    const g = createGovernor({
      maxPerMinute: 1000,
      now: () => t,
      sleep,
      jitter: () => 0,
    });
    g.recordHeaders(new Headers({ "ratelimit-remaining": "0", "ratelimit-reset": "1" }));

    const acquires = Promise.all([g.acquire(), g.acquire()]);
    await vi.waitFor(() => expect(sleep).toHaveBeenCalledTimes(1));
    t = 1000;
    resolveSleep();
    const results = await acquires;

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(results).toEqual([
      { reason: "header_exhausted", waitMs: 1000 },
      { reason: "header_exhausted", waitMs: 1000 },
    ]);
  });

  it("local budget still waits when maxPerMinute is 1", async () => {
    const sleep = vi.fn(async (ms: number) => {
      t += ms;
    });
    let t = 1_000;
    const g = createGovernor({
      maxPerMinute: 1,
      now: () => t,
      sleep,
      jitter: () => 0,
    });
    await g.acquire();
    const second = await g.acquire();
    expect(second.reason).toBe("local_budget");
    expect(second.waitMs).toBeGreaterThan(0);
  });

  it("skipLocal does not consume the sliding window", async () => {
    const sleep = vi.fn(async (ms: number) => {
      t += ms;
    });
    let t = 1_000;
    const g = createGovernor({
      maxPerMinute: 1,
      now: () => t,
      sleep,
      jitter: () => 0,
    });
    await g.acquire();
    await g.acquire({ skipLocal: true });
    expect(sleep).not.toHaveBeenCalled();
  });
});
