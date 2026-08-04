# Log Correlation + Sentry Spans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap HTTP `/api/*` requests and job runs in shared `withLogContext` so every log line carries snake_case correlation attrs (`request_id` / `job_id` / `job_run_id`) and Sentry gets a real per-unit span (`tracesSampleRate: 1` when DSN set).

**Architecture:** Module `context.ts` registers the root tslog instance, runs `runInContext` + `Sentry.startSpan` / isolation attributes. Sentry Logs transport promotes known keys from `_logMeta` into log attributes. HTTP middleware and job runner call the same helper.

**Tech Stack:** tslog v5 `runInContext`, `@sentry/node` `startSpan` / scope attributes, Hono middleware, Vitest via `./node_modules/.bin/vp test` (or `vp test` on main checkout)

**Design:** [2026-08-05-log-correlation-sentry-spans-design.md](../specs/2026-08-05-log-correlation-sentry-spans-design.md)

## Global Constraints

- Correlation attribute names are **snake_case**: `request_id`, `job_id`, `job_run_id`
- When `SENTRY_DSN` is set: `tracesSampleRate: 1` (no sample-rate env knob)
- Shared `withLogContext` for HTTP and jobs — tslog context + Sentry span
- Promote correlation keys into Sentry Logs attributes (do not dump all of `_logMeta`)
- HTTP scope remains `/api/*` access middleware
- Document conventions in `AGENTS.md`
- Prefer `vp test` / `vp check`; commit after each task
- Do not change `job_runs` schema; use existing run row id as `job_run_id`

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/logging/correlation.ts` | Known key list + `promoteCorrelationAttrs` helper |
| `src/logging/context.ts` | `registerServerTsLogger`, `withLogContext` |
| `src/logging/context.test.ts` | Context / merge tests |
| `src/logging/sentry.ts` | `tracesSampleRate`, `isSentryInitialized`, promote in Logs transport |
| `src/logging/sentry.test.ts` | Promote + init rate tests |
| `src/logging/createServerLogger.ts` | Register tslog + optional context middleware |
| `src/logging/httpAccess.ts` | `request_id` + `withLogContext` around `next()` |
| `src/logging/httpAccess.test.ts` | Expect `request_id` |
| `src/jobs/runner.ts` | Wrap `def.run`; child logger; snake_case log fields |
| `src/jobs/scheduler.ts` / `example-heartbeat` | Rename log-field `jobId` → `job_id` where touched |
| `AGENTS.md` | Correlation section |

---

### Task 1: Correlation promote helper + Sentry tracesSampleRate

**Files:**
- Create: `src/logging/correlation.ts`
- Modify: `src/logging/sentry.ts`
- Modify: `src/logging/sentry.test.ts`

**Interfaces:**
- Consumes: existing `initSentry` / `attachSentryTransports`
- Produces:
  - `CORRELATION_KEYS = ["request_id", "job_id", "job_run_id"] as const`
  - `promoteCorrelationAttrs(_logMeta: unknown, attributes: Record<string, unknown>): Record<string, unknown>`
  - `isSentryInitialized(): boolean`
  - `Sentry.init({ …, tracesSampleRate: 1 })` when DSN set

- [ ] **Step 1: Write failing tests**

Add to `src/logging/sentry.test.ts` (or a small `correlation.test.ts`):

```ts
import { promoteCorrelationAttrs } from "./correlation";

it("copies known keys from _logMeta into attributes without dumping meta", () => {
  const out = promoteCorrelationAttrs(
    {
      logLevelName: "INFO",
      request_id: "r1",
      job_id: "example-heartbeat",
      job_run_id: 42,
      hostname: "nope",
    },
    { path: "/x" },
  );
  expect(out).toEqual({
    path: "/x",
    request_id: "r1",
    job_id: "example-heartbeat",
    job_run_id: 42,
  });
  expect(out).not.toHaveProperty("hostname");
  expect(out).not.toHaveProperty("logLevelName");
});

it("lets top-level attributes win on key collision", () => {
  const out = promoteCorrelationAttrs({ request_id: "from-meta" }, { request_id: "from-top" });
  expect(out.request_id).toBe("from-top");
});
```

Extend init test expectations:

```ts
expect(init).toHaveBeenCalledWith(
  expect.objectContaining({
    enableLogs: true,
    tracesSampleRate: 1,
  }),
);
```

Add a Logs transport test: when the JSON line’s `_logMeta` contains `job_run_id`, `Sentry.logger.info` receives that attribute (build via attach + `TsLogger` like existing tests).

- [ ] **Step 2: Run tests — expect FAIL**

Run: `./node_modules/.bin/vp test src/logging/sentry.test.ts src/logging/correlation.test.ts`

- [ ] **Step 3: Implement**

`src/logging/correlation.ts`:

```ts
export const CORRELATION_KEYS = ["request_id", "job_id", "job_run_id"] as const;
export type CorrelationKey = (typeof CORRELATION_KEYS)[number];

export function promoteCorrelationAttrs(
  logMeta: unknown,
  attributes: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...attributes };
  if (!logMeta || typeof logMeta !== "object") return out;
  const meta = logMeta as Record<string, unknown>;
  for (const key of CORRELATION_KEYS) {
    if (out[key] !== undefined) continue;
    const value = meta[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}
```

In `sentry.ts`:

- Export `isSentryInitialized(): boolean` → `initialized`
- Add `tracesSampleRate: 1` to `Sentry.init`
- In Logs `write`, after destructuring:

```ts
const attributes = promoteCorrelationAttrs(_logMeta, restAttributes);
```

Keep Issues transport as-is (extra fields already in `extra`).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/logging/correlation.ts src/logging/sentry.ts src/logging/sentry.test.ts
git commit -m "$(cat <<'EOF'
feat(logging): promote correlation attrs and sample all traces

Copy request_id/job_id/job_run_id into Sentry Logs; tracesSampleRate 1 when DSN set.
EOF
)"
```

---

### Task 2: `withLogContext` + register server tslog

**Files:**
- Create: `src/logging/context.ts`
- Create: `src/logging/context.test.ts`
- Modify: `src/logging/createServerLogger.ts`

**Interfaces:**
- Consumes: `isSentryInitialized` from `./sentry`; `CORRELATION_KEYS` from `./correlation`; tslog `Logger.runInContext` / `getContext`
- Produces:
  - `registerServerTsLogger(log: TsLogger<unknown>): void`
  - `withLogContext(opts, fn): Promise<T>`
  - `LogContextAttributes` type (snake_case index signature as in spec)

- [ ] **Step 1: Write failing tests**

```ts
import { Logger as TsLogger } from "tslog";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { registerServerTsLogger, withLogContext } from "./context";

describe("withLogContext", () => {
  afterEach(() => {
    registerServerTsLogger(null as never); // or dedicated clearForTests()
  });

  it("runs fn and exposes attrs via tslog getContext inside the callback", async () => {
    const log = new TsLogger({ type: "hidden", minLevel: "INFO" });
    registerServerTsLogger(log);
    let seen: Record<string, unknown> | undefined;
    await withLogContext(
      {
        attributes: { job_id: "j1", job_run_id: 7 },
        spanName: "j1",
        spanOp: "job.run",
      },
      () => {
        seen = log.getContext();
      },
    );
    expect(seen).toMatchObject({ job_id: "j1", job_run_id: 7 });
  });
});
```

If Sentry is not initialized, span calls must not throw (mock `@sentry/node` `startSpan` to assert it is **not** required when `isSentryInitialized()` is false — or mock init false).

When Sentry **is** initialized (mock), `startSpan` is called with `{ name, op, attributes }` (only defined correlation attrs).

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement `context.ts`**

```ts
import * as Sentry from "@sentry/node";
import type { Logger as TsLogger } from "tslog";
import { CORRELATION_KEYS } from "./correlation";
import { isSentryInitialized } from "./sentry";

export type LogContextAttributes = {
  request_id?: string;
  job_id?: string;
  job_run_id?: string | number;
  [key: string]: string | number | boolean | undefined;
};

let rootTs: TsLogger<unknown> | null = null;

export function registerServerTsLogger(log: TsLogger<unknown> | null): void {
  rootTs = log;
}

function cleanAttributes(attrs: LogContextAttributes): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export async function withLogContext<T>(
  opts: { attributes: LogContextAttributes; spanName: string; spanOp: string },
  fn: () => Promise<T> | T,
): Promise<T> {
  const attributes = cleanAttributes(opts.attributes);

  const run = async (): Promise<T> => {
    if (!isSentryInitialized()) {
      return await fn();
    }
    return await Sentry.startSpan(
      { name: opts.spanName, op: opts.spanOp, attributes },
      async () => {
        const scope = Sentry.getIsolationScope();
        scope.setAttributes(attributes);
        return await fn();
      },
    );
  };

  if (!rootTs) return run();
  return rootTs.runInContext(attributes, () => run());
}
```

Adjust to real `startSpan` / `setAttributes` typings if needed (`job_run_id` number must be allowed).

In `createServerLogger`, after constructing `log`:

```ts
registerServerTsLogger(log);
```

Optional middleware so correlation keys also appear top-level on JSON/pretty (recommended for console DX):

```ts
log.use((ctx) => {
  const fields = rootTs?.getContext?.() ?? log.getContext();
  // merge CORRELATION_KEYS from fields into ctx — follow tslog middleware docs; skip if empty
  return ctx;
});
```

If middleware proves awkward in TDD, rely on `_logMeta` + Sentry promote for v1 and note in AGENTS that console may show ids under meta — prefer middleware if a short implementation works.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/logging/context.ts src/logging/context.test.ts src/logging/createServerLogger.ts
git commit -m "$(cat <<'EOF'
feat(logging): add withLogContext for tslog and Sentry spans

Register the root tslog logger and wrap units of work with runInContext + startSpan.
EOF
)"
```

---

### Task 3: Wire HTTP access middleware

**Files:**
- Modify: `src/logging/httpAccess.ts`
- Modify: `src/logging/httpAccess.test.ts`

**Interfaces:**
- Consumes: `withLogContext` from `./context`
- Produces: every `/api/*` request runs inside context with `request_id`; access log fields use `request_id`

- [ ] **Step 1: Update tests to expect `request_id`**

Replace `requestId` with `request_id` in `httpAccess.test.ts` expectations.

Add a test that logs from the **root** logger during the handler still… (optional if hard without real tslog). Minimum: access log field rename + middleware calls `withLogContext` (can spy).

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
import { withLogContext } from "./context";

export function httpAccess(logger: Logger): MiddlewareHandler {
  return async (c, next) => {
    const request_id = crypto.randomUUID();
    const started = performance.now();

    await withLogContext(
      {
        attributes: { request_id },
        spanName: `${c.req.method} ${c.req.path}`,
        spanOp: "http.server",
      },
      async () => {
        const reqLog = logger.child({
          name: "http",
          bindings: { request_id },
        });
        try {
          await next();
        } finally {
          const status = c.res.status;
          const fields = {
            method: c.req.method,
            path: c.req.path,
            status,
            durationMs: Math.round(performance.now() - started),
            request_id,
          };
          if (status >= 500) reqLog.error(fields, "http request");
          else if (status >= 400) reqLog.warn(fields, "http request");
          else reqLog.debug(fields, "http request");
        }
      },
    );
  };
}
```

- [ ] **Step 4: Run — expect PASS**

`./node_modules/.bin/vp test src/logging/httpAccess.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/logging/httpAccess.ts src/logging/httpAccess.test.ts
git commit -m "$(cat <<'EOF'
feat(logging): correlate HTTP /api requests with request_id spans

Wrap access middleware in withLogContext and use snake_case request_id.
EOF
)"
```

---

### Task 4: Wire job runner + rename log fields

**Files:**
- Modify: `src/jobs/runner.ts`
- Modify: `src/jobs/runner.test.ts` (add assertion if practical)
- Modify: `src/jobs/scheduler.ts` (log fields only)
- Modify: `src/jobs/example-heartbeat/index.ts`

**Interfaces:**
- Consumes: `withLogContext`; existing `runId` from insert
- Produces: `def.run` executes inside `{ job_id, job_run_id }` context; `ctx.logger` is a child with those bindings

- [ ] **Step 1: Failing / updated test**

In `runner.test.ts`, use a logger spy that records objects. Prefer injecting a custom logger that captures `info`/`debug`/`error` field bags and assert a run logs include `job_id` / `job_run_id` **or** assert `withLogContext` was used via a thin integration: mock `withLogContext` if needed.

Practical approach: spy on `ctx.logger` by wrapping a recording logger in the test job definition:

```ts
const seen: unknown[] = [];
const recordingLogger = {
  ...noopLogger,
  debug: (...args: unknown[]) => { seen.push(args[0]); },
  child: (opts) => {
    // return logger that merges opts.bindings into seen on debug
  },
};
```

Assert after `runJob` that some captured fields include `job_id` and `job_run_id`.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement runner wrap**

After `runId` is known:

```ts
const job_id = def.id;
const job_run_id = runId;
const runLogger = logger.child({
  name: `job:${job_id}`,
  bindings: { job_id, job_run_id },
});

const message = await withLogContext(
  {
    attributes: { job_id, job_run_id },
    spanName: job_id,
    spanOp: "job.run",
  },
  () =>
    def.run({
      db,
      logger: runLogger,
      warera: opts.warera,
      state: (job?.state as Record<string, unknown> | null) ?? null,
      setState,
    }),
);
```

Rename **log field objects** in this file and scheduler/heartbeat from `jobId` → `job_id` (keep TS param names like `jobId` if they are not log payloads).

Example heartbeat:

```ts
logger.debug({ job_id: "example-heartbeat" }, "heartbeat");
```

- [ ] **Step 4: Run job + logging tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/jobs/runner.ts src/jobs/runner.test.ts src/jobs/scheduler.ts src/jobs/example-heartbeat/index.ts
git commit -m "$(cat <<'EOF'
feat(jobs): correlate each run with job_id and job_run_id

Wrap def.run in withLogContext and pass a child logger into JobContext.
EOF
)"
```

---

### Task 5: AGENTS.md correlation docs

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Produces: Logging section documents attrs, filters, spans, snake_case rule

- [ ] **Step 1: Edit AGENTS.md**

Under Logging, add:

```markdown
### Correlation (HTTP + jobs)

Use snake_case correlation attributes on structured logs:

| Attribute | When |
| --- | --- |
| `request_id` | Inside an `/api/*` request (`withLogContext` / access middleware) |
| `job_id` | Inside a job run |
| `job_run_id` | Inside a job run (DB `job_runs.id`) |

Do not invent parallel camelCase ids (`requestId`, `jobId`) in new log fields.

**Sentry Logs filters (examples):**

- One job run: `job_run_id:<id>`
- One HTTP request: `request_id:<uuid>`
- Exclude cron/job noise: `!has:job_run_id`

Each request/job also opens a Sentry span (`http.server` / `job.run`) when `SENTRY_DSN` is set (`tracesSampleRate: 1`). Prefer filtering on `request_id` / `job_run_id` for “everything in this unit of work”; use the trace UI to see the waterfall.
```

Keep existing Sentry DSN / restart notes.

- [ ] **Step 2: `vp check` on touched files if practical; fix only issues from this branch**

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "$(cat <<'EOF'
docs(agents): document log correlation attrs and Sentry filters

Snake_case request_id/job_id/job_run_id plus Explore → Logs filter examples.
EOF
)"
```

---

## Spec coverage (self-review)

| Spec item | Task |
| --- | --- |
| `withLogContext` | 2 |
| Register tslog / `runInContext` | 2 |
| HTTP `request_id` + span | 3 |
| Job `job_id` / `job_run_id` + span + child logger | 4 |
| `tracesSampleRate: 1` | 1 |
| Promote `_logMeta` keys to Sentry Logs | 1 |
| snake_case migrations (touched logs) | 3, 4 |
| `AGENTS.md` | 5 |
| Nested HTTP→job merge | 2 (`runInContext` / Sentry child spans) — verify manually if no dedicated test |
| Out of scope (browser, sample env, schema) | Not implemented |

## Prerequisite note for implementers

Uncommitted local DX edits may already exist on `master` (`SENTRY_DEBUG`, “sentry transports attached”, `scripts/sentry-smoke.ts`). Either commit those first as a separate cleanup commit, or fold compatible bits into Task 1 without reverting useful DX.
