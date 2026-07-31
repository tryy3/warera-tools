import { describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows bursts up to maxPerMinute without waiting", async () => {
    const sleep = vi.fn(async () => {});
    let t = 0;
    const limiter = createRateLimiter({
      maxPerMinute: 2,
      now: () => t,
      sleep,
    });
    await limiter.acquire();
    await limiter.acquire();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("waits when capacity is exhausted", async () => {
    const sleep = vi.fn(async (ms: number) => {
      t += ms;
    });
    let t = 1_000;
    const limiter = createRateLimiter({
      maxPerMinute: 1,
      now: () => t,
      sleep,
    });
    await limiter.acquire();
    await limiter.acquire();
    expect(sleep).toHaveBeenCalled();
    expect(sleep.mock.calls[0]![0]).toBeGreaterThan(0);
  });
});
