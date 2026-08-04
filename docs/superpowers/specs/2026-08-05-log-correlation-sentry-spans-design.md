# Log Correlation + Sentry Spans (A+) — Design

**Date:** 2026-08-05  
**Status:** Approved  
**Depends on:** [2026-08-04-sentry-tslog-transport-design.md](./2026-08-04-sentry-tslog-transport-design.md)  
**Agent guidance:** root `AGENTS.md` Logging section (extend with correlation conventions)

## Goal

Make every **HTTP API request** and **job run** a filterable unit of work in console / file / Sentry Logs, with a matching Sentry performance span so Logs link to a real per-request / per-job trace — not a process-wide OpenTelemetry leftover.

## Decisions

| Topic | Choice |
| --- | --- |
| Model | **A+**: structured correlation attributes + short-lived Sentry spans |
| Propagation | Shared async wrapper (`withLogContext`) — tslog `runInContext` + Sentry span / isolation-scope attributes |
| Trace sampling | `tracesSampleRate: 1` whenever `SENTRY_DSN` is set |
| Attribute names | **snake_case** (`request_id`, `job_id`, `job_run_id`); migrate touched camelCase log fields |
| HTTP scope | Existing `/api/*` access middleware path (same as today) |
| Docs | Correlation filters and naming in `AGENTS.md` |
| Out of scope | Browser correlation, custom span metrics, job schema changes, sample-rate env knob |

## Problem today

- HTTP creates `requestId` and a child logger, but only the final access line uses that child; handlers log via the DI root logger without the id.
- Jobs log ad-hoc `{ jobId }` sometimes; no `job_run_id`; no scope around `def.run`.
- Sentry Node enables OTel by default; Logs often share one long-lived process trace id — useless for “show me this job run.”
- Sentry Logs transport strips `_logMeta`, while tslog `runInContext` stores context under `_logMeta` by default — correlation would not reach Sentry without an explicit promote step.

## Architecture

```
withLogContext({ attributes, spanName, spanOp }, fn)
  → if Sentry initialized: startSpan + setAttributes on isolation scope
  → tslog runInContext(attributes, fn) on the server logger instance
  → await fn()
```

| Unit of work | Attributes | Span |
| --- | --- | --- |
| HTTP `/api/*` | `request_id` (UUID) | `op: "http.server"`, name ≈ `METHOD path` |
| Job run | `job_id`, `job_run_id` | `op: "job.run"`, name ≈ `job_id` |

Nested work (e.g. job triggered from HTTP) merges attributes; inner span is a child when a parent span exists.

### Filtering (Sentry Logs / mental model)

| Intent | Filter idea |
| --- | --- |
| One job run | `job_run_id:<id>` |
| One HTTP request | `request_id:<uuid>` |
| Non-job “general” logs | `!has:job_run_id` |
| Non-request noise | `!has:request_id` (optional) |

## Components

| Piece | Role |
| --- | --- |
| `src/logging/context.ts` | `withLogContext` helper |
| `createServerLogger` / types | Expose enough surface for `runInContext` (keep narrow `Logger` for DI; internal/tslog handle for context) |
| `httpAccess.ts` | `request_id`; wrap `next()` in `withLogContext`; access log fields snake_case |
| `jobs/runner.ts` | After `job_runs` insert, wrap `def.run` in `withLogContext({ job_id, job_run_id })`; pass child logger into `ctx.logger` |
| `sentry.ts` | `tracesSampleRate: 1` when DSN set; Logs transport promotes correlation keys from `_logMeta` (and/or top-level) into Sentry log attributes |
| Call sites | Rename touched `jobId` / `requestId` log fields to snake_case |
| `AGENTS.md` | Document attrs, filters, span boundaries |

### `withLogContext`

```ts
type LogContextAttributes = {
  request_id?: string;
  job_id?: string;
  job_run_id?: string | number;
  [key: string]: string | number | boolean | undefined;
};

async function withLogContext<T>(
  opts: {
    attributes: LogContextAttributes;
    spanName: string;
    spanOp: string;
  },
  fn: () => Promise<T> | T,
): Promise<T>;
```

- No-op Sentry span/attrs when Sentry was never initialized.
- Always applies tslog async context when a server logger handle is available.

### Sentry Logs transport

When parsing the JSON line, copy known correlation keys from `_logMeta` (and any already top-level fields) into the attributes object passed to `Sentry.logger.*`, so Explore → Logs can filter them. Do not dump the entire `_logMeta` blob.

Known keys (v1): `request_id`, `job_id`, `job_run_id`.

## Error handling

- Missing DSN / init failure: correlation via tslog context still works locally; no span.
- `withLogContext` must not swallow `fn` errors; spans should mark failure if Sentry APIs support it without extra product scope.
- Transport isolate: promote logic must not throw out of `write` (try/catch or safe reads).

## Testing

- `withLogContext`: nested merge / attributes visible to a capturing sink or test double.
- `httpAccess`: access log includes `request_id` (not `requestId`).
- Job runner: a log inside `def.run` carries `job_id` + `job_run_id`.
- Sentry transport unit test: `_logMeta` / context fields with `job_run_id` appear on `Sentry.logger.*` attributes.

## Success criteria

1. Sentry Logs: filter one `job_run_id` → only that run’s lines.
2. Sentry Logs: filter one `request_id` → that request’s lines (including work logged via DI logger during the request).
3. Sentry Logs: `!has:job_run_id` excludes cron/job noise from “general” browsing.
4. Each request/job has a distinct Sentry trace (not one process-wide id on everything).
5. Console/file remain useful with the same snake_case fields.
6. `AGENTS.md` documents the convention for agents and humans.

## Out of scope

- Browser / SPA correlation
- `SENTRY_TRACES_SAMPLE_RATE` env (always 1 when DSN set)
- OpenTelemetry exporter besides Sentry
- Changing `job_runs` schema (use existing numeric/string run id as `job_run_id`)
