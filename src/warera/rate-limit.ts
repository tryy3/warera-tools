export type RateLimiterOptions = {
  maxPerMinute: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export function createRateLimiter(options: RateLimiterOptions) {
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const timestamps: number[] = [];
  const windowMs = 60_000;

  async function acquire(): Promise<void> {
    for (;;) {
      const t = now();
      while (timestamps.length && t - timestamps[0]! >= windowMs) {
        timestamps.shift();
      }
      if (timestamps.length < options.maxPerMinute) {
        timestamps.push(t);
        return;
      }
      const waitMs = windowMs - (t - timestamps[0]!) + 1;
      await sleep(waitMs);
    }
  }

  return { acquire };
}
