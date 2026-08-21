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

  it("only one sleep when two acquires hit remaining 0 together", async () => {
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
    g.recordHeaders(new Headers({ "ratelimit-remaining": "0", "ratelimit-reset": "1" }));
    await Promise.all([g.acquire(), g.acquire()]);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1000);
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
