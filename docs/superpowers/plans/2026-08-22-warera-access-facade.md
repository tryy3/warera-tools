# WarEra Access Facade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve `createWareraClient` into an api2-only in-process facade with a header-aware governor, 50-slot batching, in-flight dedup, and a fail-open `src/metrics/` module.

**Architecture:** Keep `request` / `requestBatch` as the public surface. Split policy into `governor.ts`, `dedup.ts`, and `trpc.ts` slot-chunking. Infer `callClass` from `getLogContext()`. Metrics are a sibling of logging (Noop + Sentry). Do not change job crons or browser caches.

**Tech Stack:** TypeScript, existing `createWareraClient` / tslog / Vitest via `node_modules/.bin/vp test`, `@sentry/node` Metrics, Hono + Croner callers unchanged.

**Spec:** [docs/superpowers/specs/2026-08-22-warera-access-facade-design.md](../specs/2026-08-22-warera-access-facade-design.md)

## Global Constraints

- Default upstream is `https://api2.warera.io/trpc`. No community-gateway fallback.
- `auto` auth on api2 is `Authorization: Bearer`. `authStyle: "api-key"` sends `X-API-Key` only.
- Call class: `job_id` in log context → `background`; else `interactive`; optional `init.callClass` override.
- Local RPM default stays `120`. One HTTP call = one local slot.
- 429 / `ratelimit-remaining === 0` pauses **all** sends until `ratelimit-reset` (or `Retry-After` on 429).
- 5xx + network: exponential backoff 250ms ×2 cap 5s, **max 3 retries**, then fail. Other 4xx: no retry. Single non-batch POST: do not retry 5xx (keep today’s behavior).
- Hard cap `50` procedures per HTTP batch **and** existing GET URL-length chunk (`2000`).
- Background auto-batch window is `400` ms. Interactive singles send immediately.
- Metrics names and attribute enums are exactly those in the spec. Never tag user/player ids or `request_id`.
- Metrics fail-open. Call sites never import `@sentry/node` for counters.
- No cron / TTL / Query-persistence / Geo-enqueue / Prometheus work.
- Tests: `node_modules/.bin/vp test <path>`. Check: `node_modules/.bin/vp check` after the last code task.
- Commits: one per task, message via HEREDOC, no `--no-verify`.

## File map

| File | Role |
| --- | --- |
| `src/metrics/types.ts` | `MetricAttrs`, `MetricsBackend` |
| `src/metrics/index.ts` | Process-wide `count` / `distribution` / `gauge` + `setMetricsBackend` |
| `src/metrics/recording.ts` | Test recording backend |
| `src/metrics/sentry.ts` | `Sentry.metrics.*` backend |
| `src/metrics/index.test.ts` | Fail-open + recording |
| `src/logging/createServerLogger.ts` | Attach Sentry metrics backend when DSN inits |
| `src/logging/context.ts` | `getLogContext()` |
| `src/warera/governor.ts` | Local RPM + header state + global pause |
| `src/warera/governor.test.ts` | Header parse, 429 pause, shared wait |
| `src/warera/dedup.ts` | In-flight join map |
| `src/warera/dedup.test.ts` | Key + join |
| `src/warera/call-class.ts` | `inferCallClass` |
| `src/warera/trpc.ts` | Add `chunkBatchItemsByMaxSlots` |
| `src/warera/client.ts` | Facade orchestration |
| `src/warera/client.test.ts` | Cutover, retry, 50-cap, dedup, window, metrics |
| `src/config/env.ts` | Default base URL |
| `src/db/cache.ts` | `recordCacheLookup` + L1 emit |
| Helpers under `src/warera/` | Drop redundant `baseUrl` |
| `.agents/skills/warera-api/SKILL.md` | api2-only preferences |
| `docs/warera-api/inventory.md` | As-is defaults |
| `.env.example`, `README.md` | Default URL copy |

---

### Task 1: Metrics module (Noop + recording)

**Files:**
- Create: `src/metrics/types.ts`
- Create: `src/metrics/index.ts`
- Create: `src/metrics/recording.ts`
- Test: `src/metrics/index.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export type MetricAttrs = Record<string, string | number | boolean>`
  - `export type MetricsBackend = { count(name: string, value: number, attrs?: MetricAttrs): void; distribution(name: string, value: number, attrs?: MetricAttrs, unit?: string): void; gauge(name: string, value: number, attrs?: MetricAttrs): void }`
  - `setMetricsBackend(backend: MetricsBackend | null): void`
  - `count(name: string, value?: number, attrs?: MetricAttrs): void` — default value `1`
  - `distribution(name: string, value: number, attrs?: MetricAttrs, unit?: string): void`
  - `gauge(name: string, value: number, attrs?: MetricAttrs): void`
  - `createRecordingBackend(): MetricsBackend & { events: Array<{ type: "count" | "distribution" | "gauge"; name: string; value: number; attrs?: MetricAttrs; unit?: string }> }`
  - `resetMetricsForTests(): void` — sets backend to `null`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it } from "vite-plus/test";
import { count, distribution, gauge, resetMetricsForTests, setMetricsBackend } from "./index";
import { createRecordingBackend } from "./recording";

describe("metrics", () => {
  afterEach(() => {
    resetMetricsForTests();
  });

  it("no-ops when no backend is set", () => {
    expect(() => count("warera.upstream.call")).not.toThrow();
    expect(() => distribution("warera.upstream.latency_ms", 10)).not.toThrow();
    expect(() => gauge("warera.upstream.rate_limit_remaining", 499)).not.toThrow();
  });

  it("forwards to the active backend with default count value 1", () => {
    const rec = createRecordingBackend();
    setMetricsBackend(rec);
    count("warera.upstream.call", undefined, { outcome: "ok" });
    distribution("warera.upstream.latency_ms", 12, { call_class: "interactive" }, "millisecond");
    gauge("warera.upstream.rate_limit_remaining", 499);
    expect(rec.events).toEqual([
      { type: "count", name: "warera.upstream.call", value: 1, attrs: { outcome: "ok" } },
      {
        type: "distribution",
        name: "warera.upstream.latency_ms",
        value: 12,
        attrs: { call_class: "interactive" },
        unit: "millisecond",
      },
      { type: "gauge", name: "warera.upstream.rate_limit_remaining", value: 499 },
    ]);
  });

  it("swallows backend throws", () => {
    setMetricsBackend({
      count() {
        throw new Error("boom");
      },
      distribution() {
        throw new Error("boom");
      },
      gauge() {
        throw new Error("boom");
      },
    });
    expect(() => count("x")).not.toThrow();
    expect(() => distribution("x", 1)).not.toThrow();
    expect(() => gauge("x", 1)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node_modules/.bin/vp test src/metrics/index.test.ts
```

Expected: FAIL — cannot find module `./index`.

- [ ] **Step 3: Write minimal implementation**

`src/metrics/types.ts`:

```ts
export type MetricAttrs = Record<string, string | number | boolean>;

export type MetricsBackend = {
  count(name: string, value: number, attrs?: MetricAttrs): void;
  distribution(name: string, value: number, attrs?: MetricAttrs, unit?: string): void;
  gauge(name: string, value: number, attrs?: MetricAttrs): void;
};
```

`src/metrics/recording.ts`:

```ts
import type { MetricAttrs, MetricsBackend } from "./types";

export type MetricEvent = {
  type: "count" | "distribution" | "gauge";
  name: string;
  value: number;
  attrs?: MetricAttrs;
  unit?: string;
};

export function createRecordingBackend(): MetricsBackend & { events: MetricEvent[] } {
  const events: MetricEvent[] = [];
  return {
    events,
    count(name, value, attrs) {
      events.push({ type: "count", name, value, attrs });
    },
    distribution(name, value, attrs, unit) {
      events.push({ type: "distribution", name, value, attrs, unit });
    },
    gauge(name, value, attrs) {
      events.push({ type: "gauge", name, value, attrs });
    },
  };
}
```

`src/metrics/index.ts`:

```ts
import type { MetricAttrs, MetricsBackend } from "./types";

export type { MetricAttrs, MetricsBackend } from "./types";

let backend: MetricsBackend | null = null;

export function setMetricsBackend(next: MetricsBackend | null): void {
  backend = next;
}

export function resetMetricsForTests(): void {
  backend = null;
}

function emit(fn: () => void): void {
  try {
    fn();
  } catch {
    // fail-open
  }
}

export function count(name: string, value = 1, attrs?: MetricAttrs): void {
  emit(() => backend?.count(name, value, attrs));
}

export function distribution(
  name: string,
  value: number,
  attrs?: MetricAttrs,
  unit?: string,
): void {
  emit(() => backend?.distribution(name, value, attrs, unit));
}

export function gauge(name: string, value: number, attrs?: MetricAttrs): void {
  emit(() => backend?.gauge(name, value, attrs));
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

```bash
node_modules/.bin/vp test src/metrics/index.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/metrics/types.ts src/metrics/index.ts src/metrics/recording.ts src/metrics/index.test.ts
git commit -m "$(cat <<'EOF'
feat(metrics): add fail-open count/distribution/gauge facade

Give call sites a vendor-free metrics API so WarEra and cache code can emit aggregates without importing Sentry.
EOF
)"
```

---

### Task 2: Sentry metrics backend + boot wiring

**Files:**
- Create: `src/metrics/sentry.ts`
- Create: `src/metrics/sentry.test.ts`
- Modify: `src/logging/createServerLogger.ts` — after successful `initSentry`, call `setMetricsBackend(createSentryMetricsBackend())`

**Interfaces:**
- Consumes: `MetricsBackend` from Task 1; `isSentryInitialized` is not required here — logger only wires when `initSentry` returns true
- Produces: `createSentryMetricsBackend(): MetricsBackend`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vite-plus/test";

const metrics = {
  count: vi.fn(),
  distribution: vi.fn(),
  gauge: vi.fn(),
};

vi.mock("@sentry/node", () => ({ metrics }));

import { createSentryMetricsBackend } from "./sentry";

describe("createSentryMetricsBackend", () => {
  it("forwards count/distribution/gauge with attributes and unit", () => {
    const backend = createSentryMetricsBackend();
    backend.count("warera.upstream.call", 1, { outcome: "ok" });
    backend.distribution("warera.upstream.latency_ms", 12, { call_class: "interactive" }, "millisecond");
    backend.gauge("warera.upstream.rate_limit_remaining", 499);
    expect(metrics.count).toHaveBeenCalledWith("warera.upstream.call", 1, {
      attributes: { outcome: "ok" },
    });
    expect(metrics.distribution).toHaveBeenCalledWith("warera.upstream.latency_ms", 12, {
      attributes: { call_class: "interactive" },
      unit: "millisecond",
    });
    expect(metrics.gauge).toHaveBeenCalledWith("warera.upstream.rate_limit_remaining", 499, {
      attributes: undefined,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node_modules/.bin/vp test src/metrics/sentry.test.ts
```

Expected: FAIL — cannot find module `./sentry`.

- [ ] **Step 3: Write minimal implementation**

`src/metrics/sentry.ts`:

```ts
import * as Sentry from "@sentry/node";
import type { MetricsBackend } from "./types";

export function createSentryMetricsBackend(): MetricsBackend {
  return {
    count(name, value, attrs) {
      Sentry.metrics.count(name, value, { attributes: attrs });
    },
    distribution(name, value, attrs, unit) {
      Sentry.metrics.distribution(name, value, { attributes: attrs, unit });
    },
    gauge(name, value, attrs) {
      Sentry.metrics.gauge(name, value, { attributes: attrs });
    },
  };
}
```

If TypeScript reports `Sentry.metrics` missing, add a narrow local type:

```ts
type MetricsApi = {
  count(name: string, value: number, options?: { attributes?: Record<string, string | number | boolean> }): void;
  distribution(
    name: string,
    value: number,
    options?: { attributes?: Record<string, string | number | boolean>; unit?: string },
  ): void;
  gauge(name: string, value: number, options?: { attributes?: Record<string, string | number | boolean> }): void;
};

const sentryMetrics = (Sentry as unknown as { metrics?: MetricsApi }).metrics;
if (!sentryMetrics) return; // inside each method: no-op when undefined
```

Use that guard inside each method so a missing SDK surface does not throw.

In `src/logging/createServerLogger.ts`, add:

```ts
import { setMetricsBackend } from "../metrics";
import { createSentryMetricsBackend } from "../metrics/sentry";
```

Inside the existing `if (initSentry(config))` block, immediately after it returns true:

```ts
setMetricsBackend(createSentryMetricsBackend());
```

Do not call `setMetricsBackend` when DSN is unset (Noop remains).

- [ ] **Step 4: Run the tests and make sure they pass**

```bash
node_modules/.bin/vp test src/metrics/sentry.test.ts src/logging/createServerLogger.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/metrics/sentry.ts src/metrics/sentry.test.ts src/logging/createServerLogger.ts
git commit -m "$(cat <<'EOF'
feat(metrics): wire Sentry Metrics backend at logger boot

Attach the first metrics backend next to initSentry so production emits aggregates without call-site SDK imports.
EOF
)"
```

---

### Task 3: `getLogContext`

**Files:**
- Modify: `src/logging/context.ts`
- Modify: `src/logging/context.test.ts`

**Interfaces:**
- Consumes: existing `registerServerTsLogger` / tslog `getContext()`
- Produces: `getLogContext(): LogContextAttributes` — `{}` when no root logger

- [ ] **Step 1: Write the failing test** (add to `src/logging/context.test.ts`)

```ts
import { getLogContext, registerServerTsLogger, withLogContext } from "./context";

it("getLogContext returns {} outside a context", () => {
  expect(getLogContext()).toEqual({});
});

it("getLogContext reads tslog context inside withLogContext", async () => {
  const log = new TsLogger({ type: "hidden", minLevel: "INFO" });
  registerServerTsLogger(log);
  await withLogContext(
    {
      attributes: { job_id: "j1", job_run_id: 7 },
      spanName: "j1",
      spanOp: "job.run",
    },
    () => {
      expect(getLogContext()).toMatchObject({ job_id: "j1", job_run_id: 7 });
    },
  );
});
```

Import `getLogContext` from the existing import line (replace the current named import).

- [ ] **Step 2: Run test to verify it fails**

```bash
node_modules/.bin/vp test src/logging/context.test.ts
```

Expected: FAIL — `getLogContext` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/logging/context.ts`:

```ts
export function getLogContext(): LogContextAttributes {
  if (!rootTs) return {};
  const ctx = rootTs.getContext() as LogContextAttributes | undefined;
  return ctx ?? {};
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

```bash
node_modules/.bin/vp test src/logging/context.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/logging/context.ts src/logging/context.test.ts
git commit -m "$(cat <<'EOF'
feat(logging): expose getLogContext for WarEra call class

Let the access facade infer interactive vs background from the existing tslog job/request context.
EOF
)"
```

---

### Task 4: Governor

**Files:**
- Create: `src/warera/governor.ts`
- Test: `src/warera/governor.test.ts`

**Interfaces:**
- Consumes: `createRateLimiter` from `src/warera/rate-limit.ts` (`acquire(): Promise<void>`)
- Produces:
  - `export type RateLimitWaitReason = "local_budget" | "header_exhausted" | "http_429"`
  - `export type ParsedRateLimitHeaders = { limit: number | null; remaining: number | null; resetSeconds: number | null; retryAfterSeconds: number | null }`
  - `parseRateLimitHeaders(headers: Headers): ParsedRateLimitHeaders`
  - `createGovernor(options: { maxPerMinute: number; now?: () => number; sleep?: (ms: number) => Promise<void>; jitter?: () => number }): { acquire(opts?: { skipLocal?: boolean }): Promise<{ waitMs: number; reason: RateLimitWaitReason | null }>; recordHeaders(headers: Headers): void; note429(headers: Headers): void }`
  - `jitter()` default returns `10 + Math.random() * 490` (10–500ms). Tests pass `jitter: () => 0`.

Header names are case-insensitive (`headers.get("ratelimit-remaining")` works on `Headers`). Parse with `Number` / `parseFloat`; ignore NaN.

`recordHeaders`: set `remaining` and `resetAt = now() + resetSeconds * 1000` when those fields parse. Keep last known `limit`.

`note429`: `recordHeaders` then force `remaining = 0`. If `retryAfterSeconds` is set, `resetAt = now() + retryAfterSeconds * 1000` (wins over `resetSeconds`). If neither reset nor Retry-After parsed, `resetAt = now() + 1000`.

`acquire`:
1. If `remaining !== null && remaining <= 0 && resetAt !== null`: shared wait until `resetAt + jitter`, then set `remaining = null` and `resetAt = null`. Return `{ waitMs, reason: last429 ? "http_429" : "header_exhausted" }`. Clear a private `last429` flag that `note429` sets.
2. If `!skipLocal`: call `createRateLimiter({ maxPerMinute, now, sleep }).acquire()`. If that sleep happened, include `reason: "local_budget"` (measure `now` before/after or have limiter return wait — simplest: wrap limiter and track `sleep` calls via a local `waited` flag around acquire).
3. Return `{ waitMs: total, reason }` (`reason` is the **header** reason if both waited, else local, else null). Spec: emit one `rate_limit_wait_ms` per acquire with a single reason. Prefer header/429 over `local_budget` when both occur.

Shared wait: one in-flight `pausePromise`. First waiter creates it; others await the same promise; after wake, double-check and skip if already cleared.

- [ ] **Step 1: Write the failing tests** in `src/warera/governor.test.ts`

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node_modules/.bin/vp test src/warera/governor.test.ts
```

Expected: FAIL — cannot find module `./governor`.

- [ ] **Step 3: Implement `src/warera/governor.ts`** so the tests pass. Use `createRateLimiter` for the local window. Serialize header-wait and local acquire on one promise chain (same pattern as today’s `acquireChain` in `client.ts`) so concurrent `acquire` cannot race `remaining`.

- [ ] **Step 4: Run the tests and make sure they pass**

```bash
node_modules/.bin/vp test src/warera/governor.test.ts src/warera/rate-limit.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/warera/governor.ts src/warera/governor.test.ts
git commit -m "$(cat <<'EOF'
feat(warera): add header-aware rate-limit governor

Pause all sends on remaining=0 or 429 using api2 ratelimit-reset, while keeping the local 120/min budget.
EOF
)"
```

---

### Task 5: Dedup, call class, 50-slot chunk

**Files:**
- Create: `src/warera/dedup.ts`
- Test: `src/warera/dedup.test.ts`
- Create: `src/warera/call-class.ts`
- Test: `src/warera/call-class.test.ts`
- Modify: `src/warera/trpc.ts` — add `chunkBatchItemsByMaxSlots`
- Modify: `src/warera/trpc.test.ts`
- Modify: `src/warera/index.ts` — export `chunkBatchItemsByMaxSlots` and `WARERA_MAX_BATCH_SLOTS`

**Interfaces:**
- Consumes: `getLogContext()` from Task 3; `WareraBatchItem` from `trpc.ts`
- Produces:
  - `export type WareraCallClass = "interactive" | "background"`
  - `inferCallClass(override?: WareraCallClass): WareraCallClass`
  - `dedupKey(parts: { method: string; procedure: string; input: unknown; authStyle: string; baseUrl: string }): string`
  - `createInFlightDedup(): { join<T>(key: string, start: () => Promise<T>): { joined: boolean; promise: Promise<T> } }`
  - `chunkBatchItemsByMaxSlots(items: WareraBatchItem[], maxSlots: number): WareraBatchItem[][]`
  - `export const WARERA_MAX_BATCH_SLOTS = 50` in `src/warera/trpc.ts`

`dedupKey`: `JSON.stringify([method, procedure, input, authStyle, baseUrl])`.

`join`: if key in map, return `{ joined: true, promise }`. Else start(), store promise, `finally` delete key, return `{ joined: false, promise }`. Failed promises are not kept (delete in `finally`).

`inferCallClass`: if `override` set, return it; if `getLogContext().job_id` is a non-empty string, `background`; else `interactive`.

- [ ] **Step 1: Write the failing tests**

`src/warera/dedup.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { createInFlightDedup, dedupKey } from "./dedup";

describe("dedupKey", () => {
  it("is stable for the same input object values", () => {
    expect(
      dedupKey({
        method: "GET",
        procedure: "user.getUserLite",
        input: { userId: "a" },
        authStyle: "auto",
        baseUrl: "https://api2.warera.io/trpc",
      }),
    ).toBe(
      dedupKey({
        method: "GET",
        procedure: "user.getUserLite",
        input: { userId: "a" },
        authStyle: "auto",
        baseUrl: "https://api2.warera.io/trpc",
      }),
    );
  });
});

describe("createInFlightDedup", () => {
  it("joins a second caller onto the in-flight promise", async () => {
    const dedup = createInFlightDedup();
    let starts = 0;
    const start = () => {
      starts += 1;
      return Promise.resolve("ok");
    };
    const a = dedup.join("k", start);
    const b = dedup.join("k", start);
    expect(a.joined).toBe(false);
    expect(b.joined).toBe(true);
    expect(await a.promise).toBe("ok");
    expect(await b.promise).toBe("ok");
    expect(starts).toBe(1);
  });

  it("starts a new attempt after the first promise settles (including failure)", async () => {
    const dedup = createInFlightDedup();
    const first = dedup.join("k", () => Promise.reject(new Error("nope")));
    await expect(first.promise).rejects.toThrow("nope");
    const second = dedup.join("k", () => Promise.resolve("ok"));
    expect(second.joined).toBe(false);
    expect(await second.promise).toBe("ok");
  });
});
```

`src/warera/call-class.test.ts`:

```ts
import { Logger as TsLogger } from "tslog";
import { describe, expect, it } from "vite-plus/test";
import { registerServerTsLogger, withLogContext } from "../logging/context";
import { inferCallClass } from "./call-class";

describe("inferCallClass", () => {
  it("honors an explicit override", () => {
    expect(inferCallClass("background")).toBe("background");
    expect(inferCallClass("interactive")).toBe("interactive");
  });

  it("is interactive with no job context", () => {
    registerServerTsLogger(null);
    expect(inferCallClass()).toBe("interactive");
  });

  it("is background when job_id is in log context", async () => {
    const log = new TsLogger({ type: "hidden", minLevel: "INFO" });
    registerServerTsLogger(log);
    await withLogContext(
      { attributes: { job_id: "price-poll" }, spanName: "price-poll", spanOp: "job.run" },
      () => {
        expect(inferCallClass()).toBe("background");
      },
    );
    registerServerTsLogger(null);
  });
});
```

Add to `src/warera/trpc.test.ts`:

```ts
import { chunkBatchItemsByMaxSlots } from "./trpc";

it("chunkBatchItemsByMaxSlots splits 51 items into 50 + 1", () => {
  const items = Array.from({ length: 51 }, (_, i) => ({
    procedure: "user.getUserLite",
    input: { userId: String(i) },
  }));
  const chunks = chunkBatchItemsByMaxSlots(items, 50);
  expect(chunks).toHaveLength(2);
  expect(chunks[0]).toHaveLength(50);
  expect(chunks[1]).toHaveLength(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node_modules/.bin/vp test src/warera/dedup.test.ts src/warera/call-class.test.ts src/warera/trpc.test.ts
```

Expected: FAIL — missing modules / export.

- [ ] **Step 3: Implement**

`src/warera/dedup.ts` and `src/warera/call-class.ts` as specified. In `trpc.ts`:

```ts
export const WARERA_MAX_BATCH_SLOTS = 50;

export function chunkBatchItemsByMaxSlots(
  items: WareraBatchItem[],
  maxSlots: number,
): WareraBatchItem[][] {
  if (items.length === 0) return [];
  const chunks: WareraBatchItem[][] = [];
  for (let i = 0; i < items.length; i += maxSlots) {
    chunks.push(items.slice(i, i + maxSlots));
  }
  return chunks;
}
```

Export `chunkBatchItemsByMaxSlots` and `WARERA_MAX_BATCH_SLOTS` from `src/warera/index.ts`.

- [ ] **Step 4: Tests PASS**

```bash
node_modules/.bin/vp test src/warera/dedup.test.ts src/warera/call-class.test.ts src/warera/trpc.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/warera/dedup.ts src/warera/dedup.test.ts src/warera/call-class.ts src/warera/call-class.test.ts src/warera/trpc.ts src/warera/trpc.test.ts src/warera/index.ts
git commit -m "$(cat <<'EOF'
feat(warera): add dedup, call-class inference, and 50-slot batch chunks

Lay the facade primitives so the client can join in-flight calls, classify job vs HTTP, and respect api2's batch size cap.
EOF
)"
```

---

### Task 6: Default base URL to api2

**Files:**
- Modify: `src/config/env.ts` line with `wareraApiBaseUrl` default
- Modify: `src/config/env.test.ts` — expect `https://api2.warera.io/trpc`
- Modify: `.env.example` — default and comments
- Modify: `src/logging/createServerLogger.test.ts` fixture `wareraApiBaseUrl` (optional; fixture is unused by parseConfig)

**Interfaces:**
- Produces: `parseConfig({ TURSO_DATABASE_URL }).wareraApiBaseUrl === "https://api2.warera.io/trpc"`

- [ ] **Step 1: Change the env test expectation to api2 and run it — expect FAIL**

In `src/config/env.test.ts` replace the gateway URL assertion with:

```ts
expect(cfg.wareraApiBaseUrl).toBe("https://api2.warera.io/trpc");
```

```bash
node_modules/.bin/vp test src/config/env.test.ts
```

Expected: FAIL — received gateway URL.

- [ ] **Step 2: Implement**

`src/config/env.ts`:

```ts
wareraApiBaseUrl: env.WARERA_API_BASE_URL ?? "https://api2.warera.io/trpc",
```

`.env.example` replace the WarEra block with:

```
# Official api2 tRPC. Override only for experiments.
WARERA_API_BASE_URL=https://api2.warera.io/trpc
# api2: Authorization Bearer by default; some procedures need X-API-Key (authStyle in code).
WARERA_API_KEY=
WARERA_MAX_REQUESTS_PER_MINUTE=120
```

- [ ] **Step 3: Tests PASS**

```bash
node_modules/.bin/vp test src/config/env.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/config/env.ts src/config/env.test.ts .env.example src/logging/createServerLogger.test.ts
git commit -m "$(cat <<'EOF'
feat(config): default WarEra base URL to api2

Stop preferring the community gateway so new processes talk to the official tRPC host.
EOF
)"
```

---

### Task 7: Client cutover — no gateway fallback, governor, retries, 50-cap

**Files:**
- Modify: `src/warera/client.ts`
- Modify: `src/warera/client.test.ts`

**Interfaces:**
- Consumes: `createGovernor` (Task 4), `chunkBatchItemsByMaxSlots` + `WARERA_MAX_BATCH_SLOTS` (Task 5), existing `chunkBatchItemsByMaxUrlLength`
- Produces: same `{ request, requestBatch }` plus internals that:
  - never fallback on 404 / “unknown method”
  - `MAX_RETRIES = 3` (initial + 3 retries = **4** GET attempts on endless 503)
  - 5xx/network retry on GET and on `batch=1` POST only
  - 429: `governor.note429(headers)`, wait via next `acquire`, retry up to 3, `outcome` for that attempt is `rate_limited`
  - `requestBatch` chunks with `chunkBatchItemsByMaxSlots(items, 50)` **then** URL-length chunk each piece
  - every HTTP response: `governor.recordHeaders(response.headers)`
  - `acquire` unless `skipRateLimit`

Keep `authHeaders`: `api-key` **or** (`auto` and base includes `gateway.warerastats.io`) → `X-API-Key`; else Bearer. Tests may still pass an explicit gateway `config.wareraApiBaseUrl`.

Backoff for 5xx/network: `sleep(min(5000, 250 * 2 ** attempt) + jitter)` but tests pass `sleep: async () => {}` so they do not wait. Use attempt index `0..3`.

Do **not** implement auto-batch window or dedup or metrics in this task — those are Tasks 8–9. Interactive/background both send immediately here.

- [ ] **Step 1: Rewrite `src/warera/client.test.ts` fixtures and cases**

Change `baseConfig.wareraApiBaseUrl` to `"https://api2.warera.io/trpc"`.

Replace these behaviors:

1. `stops after 2 retries on repeated 503` → `stops after 3 retries on repeated 503` and `toHaveBeenCalledTimes(4)`.
2. Replace `falls back to api2 when gateway returns unknown method` with:

```ts
it("does not fall back to a second host on unknown method", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response("unknown method: company.getProductionBonus\n", { status: 400 }));
  const client = createWareraClient({
    config: baseConfig,
    logger: testLogger(),
    fetchImpl: fetchMock,
    sleep: async () => {},
  });
  await expect(client.request("company.getProductionBonus?input=%7B%7D")).rejects.toThrow(/400/);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
```

3. Keep Bearer-on-api2 and X-API-Key-on-explicit-gateway-config tests.

4. Add 50-cap test:

```ts
it("requestBatch of 51 items sends two HTTP calls (50 + 1)", async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    const path = String(url).split("?")[0];
    const procs = path.split("/").pop()!.split(",");
    return new Response(
      JSON.stringify(procs.map(() => ({ result: { data: {} } }))),
      { status: 200 },
    );
  });
  const client = createWareraClient({
    config: { ...baseConfig, wareraMaxRequestsPerMinute: 10_000 },
    logger: testLogger(),
    fetchImpl: fetchMock,
    sleep: async () => {},
  });
  const items = Array.from({ length: 51 }, (_, i) => ({
    procedure: "user.getUserLite",
    input: { userId: `u${i}` },
  }));
  const results = await client.requestBatch(items);
  expect(results).toHaveLength(51);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const firstUrl = String(fetchMock.mock.calls[0]![0]);
  expect(firstUrl.split("?")[0].split("/").pop()!.split(",")).toHaveLength(50);
});
```

5. Add 429 retry test:

```ts
it("retries GET after 429 once the governor waits", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response("slow down", {
        status: 429,
        headers: { "ratelimit-reset": "1", "ratelimit-remaining": "0" },
      }),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  const sleep = vi.fn(async () => {});
  const client = createWareraClient({
    config: { ...baseConfig, wareraMaxRequestsPerMinute: 10_000 },
    logger: testLogger(),
    fetchImpl: fetchMock,
    sleep,
    now: () => 0,
  });
  await expect(client.request("/v1/ping")).resolves.toEqual({ ok: true });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(sleep).toHaveBeenCalled();
});
```

6. Keep empty-batch, GET batch, POST json api-key, POST batch tests.

7. Keep `does not retry POST on 503` (single POST, 1 fetch).

- [ ] **Step 2: Run tests — expect FAIL** (fallback still exists / retry count 3 / no 50-cap)

```bash
node_modules/.bin/vp test src/warera/client.test.ts
```

- [ ] **Step 3: Implement in `client.ts`**

Remove `isUnknownMethodBody`, `canFallbackToApi2`, and the api2 fallback block.

Construct one `createGovernor({ maxPerMinute: config.wareraMaxRequestsPerMinute, now, sleep })` per client.

In `requestOnce`, return `{ ok, json, status, bodyText, headers: response.headers }` (always keep `Headers`). After every response (ok or not), `governor.recordHeaders`. On `status === 429`, `governor.note429` then throw a tagged error the retry loop recognizes.

Retry loop (`MAX_RETRIES = 3`):

```ts
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
function isBatchPost(method: string, path: string): boolean {
  return method === "POST" && path.includes("batch=1");
}
function canRetry(method: string, path: string, status: number | undefined, is429: boolean): boolean {
  if (is429) return true;
  const idempotent = method === "GET" || isBatchPost(method, path);
  if (!idempotent) return false;
  if (status === undefined) return true; // network
  return RETRYABLE_STATUSES.has(status);
}
```

Before each attempt (except `skipRateLimit`): `await governor.acquire()`. After 429, the next `acquire` performs the header wait.

`requestBatch`:

```ts
const slotChunks = chunkBatchItemsByMaxSlots(items, WARERA_MAX_BATCH_SLOTS);
for (const slotChunk of slotChunks) {
  const urlChunks = chunkBatchItemsByMaxUrlLength(
    slotChunk,
    WARERA_MAX_BATCH_URL_LENGTH,
    isPost ? wareraBatchPostPath : wareraBatchPath,
  );
  for (const chunk of urlChunks) {
    // existing executeRequest + parseTrpcBatchResponse
  }
}
```

- [ ] **Step 4: Tests PASS**

```bash
node_modules/.bin/vp test src/warera/client.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/warera/client.ts src/warera/client.test.ts
git commit -m "$(cat <<'EOF'
feat(warera): cut over client to api2 with governor and 50-slot batches

Drop gateway fallback, honor 429/reset pauses, and chunk tRPC batches so we stay under api2's slot cap.
EOF
)"
```

---

### Task 8: Client observability (call class, logs, metrics)

**Files:**
- Modify: `src/warera/client.ts`
- Modify: `src/warera/client.test.ts`

**Interfaces:**
- Consumes: `inferCallClass` (Task 5), `count` / `distribution` / `gauge` (Task 1), `WareraRequestInit.callClass?: WareraCallClass`
- Produces: every HTTP attempt emits the spec metrics and debug log fields

Per **procedure slot** (single request = 1 slot; batch = N slots):

```ts
count("warera.upstream.call", 1, { procedure, call_class, outcome });
```

`procedure` for a single path is `path.split("?")[0].replace(/^\//, "")`. For a batch HTTP call, emit one `warera.upstream.call` **per item.procedure** in that chunk (same `outcome` / `call_class`).

Per **HTTP request**:

```ts
distribution("warera.upstream.latency_ms", durationMs, { call_class, outcome }, "millisecond");
distribution("warera.upstream.batch_size", slotCount, { call_class });
distribution("warera.upstream.response_bytes", byteLength, { call_class });
```

`byteLength`: `JSON.stringify(json).length` on success; `bodyText.length` on error; `0` on network throw.

If `acquire.waitMs > 0`:

```ts
distribution("warera.upstream.rate_limit_wait_ms", acquire.waitMs, { reason: acquire.reason });
```

After headers with a numeric remaining:

```ts
gauge("warera.upstream.rate_limit_remaining", remaining);
```

Debug log object: `{ procedure, call_class, status, durationMs, outcome, ratelimit_remaining, ratelimit_reset }` (omit header fields when null). Keep message `"warera request"`. Update the existing “logs path, status, and durationMs” test to accept `procedure` + `call_class` + `outcome` (path may remain for now **or** be replaced by `procedure` — replace `path` with `procedure` to match the spec).

`outcome`: `ok` | `rate_limited` | `http_error` | `network_error`. 429 → `rate_limited` even if a later retry succeeds (emit on the failed attempt). Successful attempt → `ok`.

- [ ] **Step 1: Add tests** using `createRecordingBackend` + `setMetricsBackend` / `resetMetricsForTests` in `afterEach`.

```ts
it("emits call/latency/batch metrics on success", async () => {
  const rec = createRecordingBackend();
  setMetricsBackend(rec);
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "ratelimit-remaining": "498", "ratelimit-reset": "59" },
      }),
    );
  const client = createWareraClient({
    config: { ...baseConfig, wareraMaxRequestsPerMinute: 10_000 },
    logger: testLogger(),
    fetchImpl: fetchMock,
    sleep: async () => {},
  });
  await client.request("country.getAllCountries", { callClass: "interactive" });
  expect(rec.events.some((e) => e.type === "count" && e.name === "warera.upstream.call")).toBe(true);
  expect(
    rec.events.some(
      (e) =>
        e.type === "count" &&
        e.name === "warera.upstream.call" &&
        e.attrs?.procedure === "country.getAllCountries" &&
        e.attrs?.call_class === "interactive" &&
        e.attrs?.outcome === "ok",
    ),
  ).toBe(true);
  expect(rec.events.some((e) => e.type === "gauge" && e.name === "warera.upstream.rate_limit_remaining" && e.value === 498)).toBe(true);
});

it("records rate_limited on 429 then ok on retry", async () => {
  const rec = createRecordingBackend();
  setMetricsBackend(rec);
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response("nope", { status: 429, headers: { "ratelimit-reset": "1", "ratelimit-remaining": "0" } }),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  const client = createWareraClient({
    config: { ...baseConfig, wareraMaxRequestsPerMinute: 10_000 },
    logger: testLogger(),
    fetchImpl: fetchMock,
    sleep: async () => {},
    now: () => 0,
  });
  await client.request("country.getAllCountries");
  const outcomes = rec.events
    .filter((e) => e.type === "count" && e.name === "warera.upstream.call")
    .map((e) => e.attrs?.outcome);
  expect(outcomes).toContain("rate_limited");
  expect(outcomes).toContain("ok");
});
```

- [ ] **Step 2: Run — expect FAIL** (no metrics yet)

```bash
node_modules/.bin/vp test src/warera/client.test.ts
```

- [ ] **Step 3: Implement emit helpers in `client.ts`** and thread `callClass = inferCallClass(init.callClass)` through `request` / `requestBatch`. Extend `WareraRequestInit` with `callClass?: WareraCallClass`.

- [ ] **Step 4: Tests PASS**

```bash
node_modules/.bin/vp test src/warera/client.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/warera/client.ts src/warera/client.test.ts src/warera/index.ts
git commit -m "$(cat <<'EOF'
feat(warera): emit facade metrics and call_class logs

Record volume, latency, batch size, bytes, and quota so we can tune api2 pressure without log archaeology.
EOF
)"
```

Export `WareraCallClass` from `index.ts` if not already.

---

### Task 9: In-flight dedup + background batch window

**Files:**
- Modify: `src/warera/client.ts`
- Modify: `src/warera/client.test.ts`

**Interfaces:**
- Consumes: `createInFlightDedup`, `dedupKey` (Task 5)
- Produces:
  - `export const WARERA_BATCH_WINDOW_MS = 400`
  - GET singles (`json === undefined`, method GET, not `skipRateLimit`) with `callClass === "background"` enqueue and flush after 400ms (injectable clock: use existing `now` + `sleep`)
  - Interactive GET singles send immediately (no timer)
  - Compatible queue key: `method + authStyle + resolvedBaseUrl` (GET only)
  - Dedup wraps the **logical** single (procedure + input) before the window: two concurrent identical `request`s share one promise and increment `warera.upstream.dedup_join`
  - Explicit `requestBatch` does not wait for the 400ms window
  - `skipRateLimit` singles bypass the window (send now)

Flush implementation: maintain `queue: Array<{ item: WareraBatchItem; resolve; reject; authStyle; baseUrl; callClass }>` and a `timer`. On enqueue, if no timer, `sleep(400)` then flush. Flush groups by `authStyle + baseUrl`. One item → existing single GET path. Two+ → `requestBatch` internals (already chunked). Use fake `sleep` in tests: for background, the test’s `sleep` should resolve the 400ms wait immediately **and** record it, e.g.

```ts
const sleep = vi.fn(async (ms: number) => {
  waits.push(ms);
});
```

Then `expect(waits).toContain(400)`.

Because `sleep: async () => {}` already resolves immediately, a background `request()` in tests will enqueue, sleep(400) (instant), flush, and complete — so existing tests that `request("/v1/ping")` without `callClass: "interactive"` stay **interactive** (no `job_id`). That preserves current tests. Add an explicit background test that wraps `withLogContext({ job_id: "t" })`.

Dedup test (interactive, no window):

```ts
it("dedups two concurrent identical GET singles", async () => {
  const rec = createRecordingBackend();
  setMetricsBackend(rec);
  let resolveFetch!: (v: Response) => void;
  const fetchMock = vi.fn(
    () =>
      new Promise<Response>((r) => {
        resolveFetch = r;
      }),
  );
  const client = createWareraClient({
    config: { ...baseConfig, wareraMaxRequestsPerMinute: 10_000 },
    logger: testLogger(),
    fetchImpl: fetchMock,
    sleep: async () => {},
  });
  const p1 = client.request("user.getUserLite?input=%7B%22userId%22%3A%22a%22%7D");
  const p2 = client.request("user.getUserLite?input=%7B%22userId%22%3A%22a%22%7D");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  resolveFetch(new Response(JSON.stringify({ result: { data: { id: "a" } } }), { status: 200 }));
  await Promise.all([p1, p2]);
  expect(rec.events.some((e) => e.type === "count" && e.name === "warera.upstream.dedup_join")).toBe(true);
});
```

Background batch test: two `request`s of different user ids inside `withLogContext({ job_id: "j" })` started in the same tick, `sleep` records 400, **one** fetch with `batch=1`.

For dedup keys on path-style `request`, parse procedure as `path.split("?")[0].replace(/^\//, "")` and input as the `input` query JSON if present, else `undefined`.

- [ ] **Step 1: Write the failing tests** (dedup + background window) as above.

- [ ] **Step 2: Run — expect FAIL**

```bash
node_modules/.bin/vp test src/warera/client.test.ts
```

- [ ] **Step 3: Implement queue + dedup in `client.ts`.** Keep `requestBatch` on the immediate path (no 400ms). After flush, map batch slot results back to each waiter (`ok` → ` { result: { data } }` shape the caller of `request` expects — today’s `request` returns raw tRPC JSON, so resolve with `{ result: { data: slot.data } }` or the same unwrap the single GET would have returned). **Important:** `request()` today returns the full tRPC envelope (`{ result: { data } }`), not unwrapped data. Batch flush must resolve waiters with that same envelope.

- [ ] **Step 4: Tests PASS** including the full previous client suite.

```bash
node_modules/.bin/vp test src/warera/client.test.ts src/warera/users.test.ts src/warera/work-stats.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/warera/client.ts src/warera/client.test.ts
git commit -m "$(cat <<'EOF'
feat(warera): add in-flight dedup and background batch window

Coalesce job GETs for 400ms and join identical in-flight calls so api2 sees fewer duplicate hits.
EOF
)"
```

---

### Task 10: Drop redundant helper `baseUrl` overrides

**Files:**
- Modify: `src/warera/companies.ts` — remove `baseUrl` from `fetchCompanyProductionBonus` and `fetchBestRecommendedRegion`; keep `authStyle: "api-key"` on recommended regions
- Modify: `src/warera/companies.test.ts` — stop expecting `baseUrl` in `objectContaining` for production bonus; recommended-regions call should still include `authStyle: "api-key"`
- Modify: `src/warera/mu.ts` — remove `baseUrl` from `fetchMuMembersByMu`
- Modify: `src/warera/mu.test.ts` — drop `baseUrl` assertion (keep other request options)
- Modify: `src/warera/transactions.ts` — remove `baseUrl: API2_TRPC_BASE`; keep `authStyle: "api-key"`
- Modify: `src/warera/transactions.test.ts` — expect `authStyle: "api-key"` and **no** required `baseUrl`
- Modify: `src/warera/work-stats.ts` — remove `baseUrl` from the shared init; keep `authStyle: "api-key"`
- Modify: `src/warera/work-stats.test.ts` — drop `baseUrl` from `toMatchObject` if present

**Interfaces:**
- Consumes: default client base is api2 (Task 6)
- Produces: helpers only override `authStyle` when X-API-Key is required

- [ ] **Step 1: Update helper tests first** (remove `baseUrl` expectations). Run them — they may still PASS if tests only check `authStyle`, or FAIL if they require `baseUrl`.

```bash
node_modules/.bin/vp test src/warera/companies.test.ts src/warera/mu.test.ts src/warera/transactions.test.ts src/warera/work-stats.test.ts
```

- [ ] **Step 2: Remove the `baseUrl` overrides** in the four helper files. Leave comments that those procedures need `X-API-Key` / are unofficial OpenAPI where that is still true. Delete comments that say “force api2 because gateway misses” once the override is gone.

Example `fetchBestRecommendedRegion` init:

```ts
const json = await warera.request<unknown>("company.getRecommendedRegionIdsByItemCode", {
  method: "POST",
  json: { itemCode, count: 1 },
  authStyle: "api-key",
});
```

- [ ] **Step 3: Tests PASS**

```bash
node_modules/.bin/vp test src/warera/companies.test.ts src/warera/mu.test.ts src/warera/transactions.test.ts src/warera/work-stats.test.ts src/economy/advisor.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/warera/companies.ts src/warera/companies.test.ts src/warera/mu.ts src/warera/mu.test.ts src/warera/transactions.ts src/warera/transactions.test.ts src/warera/work-stats.ts src/warera/work-stats.test.ts
git commit -m "$(cat <<'EOF'
refactor(warera): drop redundant api2 baseUrl overrides on helpers

Default egress is api2; keep X-API-Key only on procedures that reject Bearer.
EOF
)"
```

---

### Task 11: L1 cache lookup metrics

**Files:**
- Modify: `src/db/cache.ts`
- Modify: `src/db/cache.test.ts`

**Interfaces:**
- Consumes: `count` from `src/metrics`
- Produces:
  - `recordCacheLookup(cache_kind: string, result: "hit" | "miss" | "stale"): void`
  - `getCached` emits `cache.l1.lookup` via `recordCacheLookup("kv", result)`
  - `getOrFetch` does **not** emit a second lookup (it uses `getCached`)

`recordCacheLookup`:

```ts
import { count } from "../metrics";

export function recordCacheLookup(
  cache_kind: string,
  result: "hit" | "miss" | "stale",
): void {
  count("cache.l1.lookup", 1, { cache_kind, result });
}
```

Change `getCached` to use `getCachedRow`, then:

- no row → `recordCacheLookup("kv", "miss")`, return null
- row and `!isCacheFresh` → `recordCacheLookup("kv", "stale")`, return null
- else → `recordCacheLookup("kv", "hit")`, return payload

- [ ] **Step 1: Write unit tests** that stub metrics via `createRecordingBackend` (do not need a real DB if you extract the decision — or test `recordCacheLookup` plus a small helper). Prefer testing `recordCacheLookup` plus exporting a pure `classifyCacheRow(row, now)` if that keeps cache.test.ts free of Turso.

Simplest path that still covers the spec: add `classifyCacheLookup(row: { fetchedAt: Date; ttlSeconds: number } | null, now: Date): "hit" | "miss" | "stale"` in `cache.ts`, use it from `getCached`, test it in `cache.test.ts`:

```ts
it("classifyCacheLookup distinguishes miss/stale/hit", () => {
  const now = new Date("2026-07-31T12:01:00.000Z");
  expect(classifyCacheLookup(null, now)).toBe("miss");
  expect(
    classifyCacheLookup({ fetchedAt: new Date("2026-07-31T12:00:00.000Z"), ttlSeconds: 30 }, now),
  ).toBe("stale");
  expect(
    classifyCacheLookup({ fetchedAt: new Date("2026-07-31T12:00:00.000Z"), ttlSeconds: 120 }, now),
  ).toBe("hit");
});

it("recordCacheLookup emits cache.l1.lookup", () => {
  const rec = createRecordingBackend();
  setMetricsBackend(rec);
  recordCacheLookup("kv", "hit");
  expect(rec.events).toEqual([
    { type: "count", name: "cache.l1.lookup", value: 1, attrs: { cache_kind: "kv", result: "hit" } },
  ]);
  resetMetricsForTests();
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
node_modules/.bin/vp test src/db/cache.test.ts
```

- [ ] **Step 3: Implement `classifyCacheLookup`, `recordCacheLookup`, and wire `getCached`.**

- [ ] **Step 4: Tests PASS**

```bash
node_modules/.bin/vp test src/db/cache.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/db/cache.ts src/db/cache.test.ts
git commit -m "$(cat <<'EOF'
feat(cache): emit L1 hit/miss/stale metrics

Expose recordCacheLookup so dedicated tables can opt in later without a second metrics API.
EOF
)"
```

---

### Task 12: Docs — skill, inventory, README

**Files:**
- Modify: `.agents/skills/warera-api/SKILL.md`
- Modify: `docs/warera-api/inventory.md`
- Modify: `README.md` WarEra API section

Do **not** edit `docs/warera-api/vision.md` (direction unchanged). Do **not** change cron strings in inventory.

- [ ] **Step 1: Update the skill**

Replace “Base URLs (project preference)” with:

```markdown
## Base URLs (project preference)

tRPC base path includes `/trpc`.

| Priority | Base URL | When |
| --- | --- | --- |
| 1 (default) | `https://api2.warera.io/trpc` | Normal operation |
| experiment | any other `WARERA_API_BASE_URL` | Local experiments only — not a supported dual-path |

Default `WARERA_API_BASE_URL` is `https://api2.warera.io/trpc`. Do not use undocumented hosts such as `api5` for public integrations.
```

Remove the gateway curl example (or keep it under a one-line “historical / experiment” note). Drop “Gateway does not currently expose that procedure — call api2 directly” as a *routing* rule; keep “not on official OpenAPI; requires X-API-Key” for recommended-regions / work-stats / muMember.

Replace Auth / Rate limits / Project client preferences with:

```markdown
## Auth

| Target | Header |
| --- | --- |
| `api2.warera.io` | `Authorization: Bearer <token>` by default; **some procedures require `X-API-Key` instead** (recommended regions, work-stats, item-market txs) |

Use `WARERA_API_KEY`. Never hardcode secrets.

`src/warera/client.ts`: `auto` = Bearer on api2; `authStyle: "api-key"` forces `X-API-Key`. No gateway-miss fallback.

## Rate limits & caching

- Soft local limiter: `WARERA_MAX_REQUESTS_PER_MINUTE` (default 120), one HTTP call per slot.
- api2 headers (observed): `ratelimit-limit` / `ratelimit-policy` (`500;w=60`) / `ratelimit-remaining` / `ratelimit-reset` (seconds). 429 pauses **all** in-flight sends until reset (`Retry-After` wins when present).
- tRPC HTTP batches: max **50** procedures per request; GET URL-length chunk 2000 remains. Background singles coalesce ~400ms.
- L1 freshness is our Turso tables / pack TTL — not a community gateway cache.

## Project client

Use / extend `src/warera/` (`createWareraClient` facade). Do not add a parallel HTTP stack.

Preferences:

1. Call only allowlisted procedures (see index below / OpenAPI).
2. Default base is api2 `/trpc`.
3. Log procedure, `call_class`, status, latency, outcome.
4. Retry GET and read-only `batch=1` POST on 5xx/network (max 3) and 429 (reset wait). Do not retry other 4xx.
5. For response field details, consult community docs; for “is this allowed?”, consult official OpenAPI.
```

Update the skill `description` frontmatter to drop “prefer gateway”.

Update checklist item 2: “Base URL is api2 `/trpc` (not inventing hosts/paths)”.

- [ ] **Step 2: Update inventory**

Architecture snapshot: browser → Hono → Turso → jobs → `createWareraClient` (governor, batch, dedup) → `api2.warera.io/trpc`.

Client defaults table:

| Setting | Typical value |
| --- | --- |
| `WARERA_API_BASE_URL` | `https://api2.warera.io/trpc` |
| Soft limiter | `WARERA_MAX_REQUESTS_PER_MINUTE` (default 120) |
| Header-aware 429 pause | Implemented (`ratelimit-*` / `Retry-After`) |
| Client tRPC HTTP batch | `requestBatch` + background 400ms window; max 50 slots |
| In-flight dedup | Same procedure+input+auth+base |
| Browser shared cache | TanStack Query, memory-only (unchanged) |
| localStorage | Prefs only (unchanged) |

Per-resource “Upstream today”: change “Prefer gateway” / “client default” to **api2**. Keep “Forced api2 + X-API-Key” wording where authStyle is still special (recommended regions, item txs, work-stats, muMember).

Known gaps: remove “No tRPC batching or in-flight dedup” and “soft limiter does not read headers”. Keep Geo event-driven and browser durable cache as gaps.

Last reviewed date: `2026-08-22`.

- [ ] **Step 3: Update `README.md` WarEra API section**

Replace the gateway/fallback bullets with:

```markdown
- Default: `https://api2.warera.io/trpc` (`WARERA_API_BASE_URL`)
- Auth: `Authorization: Bearer` by default; some procedures use `X-API-Key` (`WARERA_API_KEY`)
- In-process facade: local RPM + header-aware 429 pause, tRPC batch (max 50), in-flight dedup
```

- [ ] **Step 4: Run a focused regression + check**

```bash
node_modules/.bin/vp test src/warera/client.test.ts src/warera/governor.test.ts src/metrics/index.test.ts src/config/env.test.ts src/db/cache.test.ts
node_modules/.bin/vp check
```

Expected: PASS (fix any format/lint the check applies).

- [ ] **Step 5: Commit**

```bash
git add .agents/skills/warera-api/SKILL.md docs/warera-api/inventory.md README.md
git commit -m "$(cat <<'EOF'
docs(warera-api): document api2-only facade defaults

Align the skill, inventory, and README with the governor, 50-slot batching, and dropped gateway fallback.
EOF
)"
```

---

## Self-review (plan vs spec)

| Spec section | Task |
| --- | --- |
| api2 default, no gateway fallback | 6, 7 |
| Auth Bearer / api-key | 7, 10 |
| `getLogContext` + call class | 3, 5, 8, 9 |
| Governor headers + global 429 | 4, 7 |
| 5xx backoff max 3 | 7 |
| 50-slot + URL chunk | 5, 7 |
| Background 400ms / interactive immediate | 9 |
| In-flight dedup + `dedup_join` | 5, 9 |
| Metrics module + Sentry + fail-open | 1, 2, 8 |
| Day-one metric names + `response_bytes` | 8 |
| L1 `recordCacheLookup` | 11 |
| Helper `baseUrl` drop | 10 |
| Skill + inventory | 12 |
| No cadence / L2 / L4 / Prometheus | honored (not tasked) |
