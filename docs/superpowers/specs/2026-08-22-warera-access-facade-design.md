# WarEra access facade — Design

**Date:** 2026-08-22  
**Status:** Approved  
**Depends on / extends:**

- [WarEra API access & caching vision](./2026-08-06-warera-api-access-vision-design.md) (directional tracking)
- [Living vision](../../warera-api/vision.md)
- [Inventory (as-is)](../../warera-api/inventory.md)
- [`.agents/skills/warera-api/`](../../../.agents/skills/warera-api/SKILL.md)

## Goal

Evolve `createWareraClient` into the in-process WarEra access facade: **api2 only**, header-aware rate-limit governance, background batching (max 50 slots), in-flight dedup, and a decoupled metrics module — without changing job frequencies, TTLs, or browser cache layers.

## Decisions

| Topic | Choice |
| --- | --- |
| Public API | Keep `createWareraClient` + `request` / `requestBatch`; split internals into focused files |
| Upstream | Default `https://api2.warera.io/trpc`; drop gateway-miss fallback |
| Auth | `auto` = Bearer on api2; `authStyle: "api-key"` only where api2 requires `X-API-Key` |
| Call class | Infer from log context (`job_id` → `background`; otherwise `interactive`); optional per-call override |
| Governor | Local RPM (default 120) **plus** `ratelimit-*` headers; 429 pauses **all** in-flight/queued sends |
| 5xx / network | Exponential backoff, max 3 retries, then fail |
| Batch cap | 50 procedures per HTTP request (server hard limit) **and** existing GET URL-length chunking |
| Auto-batch | Background ~400ms window; interactive flushes without that wait; explicit `requestBatch` is immediate |
| Metrics | `src/metrics/` with Noop + Sentry (`Sentry.metrics.*`); fail-open |
| Cadence | **No** cron / TTL / freshness-target edits in this work |
| Python client | Take 50-cap, header governor, bounded retries — not SWR, 5ms auto-batch, or X-API-Key-on-everything |

## Architecture

```
Jobs / Hono / typed helpers (src/warera/*.ts)
        │
        ▼
createWareraClient  (facade)
  ├─ call class (context or override)
  ├─ in-flight dedup
  ├─ batch window / 50-cap / URL chunk
  ├─ governor (local RPM + headers + global 429 pause)
  ├─ structured logs + src/metrics
  └─ fetch → api2.warera.io/trpc
```

Jobs still decide *when* work runs. The facade decides *how* HTTP leaves. Domain math stays out of this module.

## Egress and auth

### Upstream

- `parseConfig` default for `WARERA_API_BASE_URL` becomes `https://api2.warera.io/trpc`.
- Remove the gateway-miss path (`404` / body matching `/unknown method/i` → retry api2).
- Per-request `baseUrl` stays for tests and rare forced-host experiments. An env override to a non-api2 host is unsupported dual-path, not a feature.
- Typed helpers that hardcode `baseUrl: API2_TRPC_BASE` drop that override once the default is api2. They **keep** `authStyle: "api-key"` where required (recommended regions, work-stats, item-market transactions, and any later procedures that reject Bearer).

### Auth

- Single secret: `WARERA_API_KEY`.
- `authStyle: "auto"` on api2 sends `Authorization: Bearer <key>` when a key is set.
- `authStyle: "api-key"` sends `X-API-Key`. We do not send both. We do not assume `X-API-Key` works for every procedure.

### Logging

Every completed HTTP attempt logs (debug today, keep that level): `procedure` (or path without query if a raw path is used), `call_class`, `status`, `durationMs`, `outcome`, and header-derived `ratelimit_remaining` / `ratelimit_reset` when present. Correlation ids stay on the existing `request_id` / `job_id` / `job_run_id` context — do not duplicate them as new camelCase fields.

## Call class

Export `getLogContext(): LogContextAttributes` from `src/logging/context.ts` that reads the registered tslog `getContext()` (already proven in `context.test.ts`). The facade uses it on each `request` / `requestBatch`.

| Condition | `call_class` | Batching |
| --- | --- | --- |
| Explicit `init.callClass` | That value | Per class |
| Context has `job_id` | `background` | ~400ms coalesce, then flush |
| Otherwise (HTTP `request_id`, tests, boot) | `interactive` | Send immediately — no 400ms wait |

`WareraRequestInit` gains optional `callClass?: "interactive" | "background"`.

## Governor

Replace “serialized local 120/min only” with a process-wide governor used by every send (single and batch).

### Local budget

- Keep `WARERA_MAX_REQUESTS_PER_MINUTE` (default **120**). Do not raise the default in this pass.
- One **HTTP** request consumes one local slot (a 50-slot tRPC batch is one HTTP call).
- Keep serialized `acquire` so concurrent sends cannot race the window.

### Server headers (observed on api2)

Parse case-insensitive after **every** response (success or error):

| Header | Use |
| --- | --- |
| `ratelimit-limit` | Quota (e.g. 500) |
| `ratelimit-policy` | Informational (`500;w=60`); do not invent a second limiter from it |
| `ratelimit-remaining` | Requests left in this window |
| `ratelimit-reset` | **Seconds** until the window resets |
| `Retry-After` | On 429, wins over `ratelimit-reset` when present and numeric |

Store `remaining` and `resetAt = now + resetSeconds` (monotonic). After a 429 or `remaining === 0`, **all** subsequent `acquire`s wait on the **same** sleep. First waiter sleeps; others join that wait (double-check after wake). Small jitter (10–500ms) after reset to avoid a thundering herd. Then clear exhausted state so the next response can refill headers.

`remaining` from headers is the source of truth for api2’s 500/min budget. We do not assume 1 HTTP = 1 quota unit; after a batch, the next `remaining` value tells us what the server counted.

### Outcomes

`outcome` is one of: `ok` | `rate_limited` | `http_error` | `network_error`.

- 429 is **never** classified as `http_error`.
- A 429 that retries and then succeeds is still logged/metrics’d as a rate-limit wait on the failed attempt; the successful attempt is `ok`.

## Retry

| Case | Behavior |
| --- | --- |
| **429** | Update governor from headers. Pause **all** sends until reset. Retry up to **3** times. Wait is the server reset (or `Retry-After`), not the 5xx backoff curve. |
| **500, 502, 503, 504** and **network / transport errors** | Exponential backoff: start **250ms**, ×**2**, cap **5s**, add jitter. Max **3** retries, then fail. |
| **Other 4xx** (400, 401, 403, 404, …) | No retry. |

Retries apply to GET **and** to our read-only batch requests (GET `batch=1` or POST `batch=1` with JSON body). We do not retry forever. Exhausted failures still throw; jobs/HTTP error handling is unchanged (Issues on `error`/`fatal`).

Do not treat 429 as a retryable “transient 5xx” in the same loop: if the governor already waited the full reset, the next attempt is a fresh send, not a stacked backoff.

## Batching

### Caps (both apply)

1. **50 procedures per HTTP batch** (`WARERA_MAX_BATCH_SLOTS = 50`). Chunk larger `requestBatch` / window flushes into sequential 50-slot HTTP calls (preserve order).
2. Existing **GET URL-length** chunking (`WARERA_MAX_BATCH_URL_LENGTH = 2000`). POST batches measure the procedure-only path (inputs in the body).

Auto-batch only when `method`, `authStyle`, and `baseUrl` match. GET and POST never share a batch.

### When we batch

| Path | Behavior |
| --- | --- |
| Explicit `requestBatch(items)` | Flush now; still chunk at 50 + URL length |
| `background` singles | Queue ~400ms, then one compatible batch (or a single GET if only one item) |
| `interactive` singles | Send immediately (no timer). If two compatible interactive singles are already queued in the same synchronous turn, they may flush as one batch; they must not wait for a later job or request |

Helpers that already batch (work-stats, user lite / getUserById, follow sync, MU search hydrate) stay. Add a new explicit `requestBatch` only where a job still fires an obvious independent one-by-one GET loop that the window cannot see (e.g. strictly sequential dependent pagination). No cron changes.

### Future (not this pass)

Payload-aware splitting (huge responses vs more HTTP calls). Day-one metrics must be enough to decide later: `batch_size`, `latency_ms`, `response_bytes` on each HTTP response.

## In-flight dedup

Key (canonical JSON for `input`, stable key order via `JSON.stringify` of the value as passed):

`method + procedure + inputJson + authStyle + resolvedBaseUrl`

If a matching call is already in flight, later callers await the same promise (count `warera.upstream.dedup_join`). Failures are not stored — the next caller starts a new attempt. Dedup applies to singles and to identical slots that would otherwise be sent twice; it does not merge different procedures.

## Metrics

### Module

`src/metrics/` — sibling to `src/logging/`. Call sites (including the facade) never import `@sentry/node` for counters.

```ts
type MetricAttrs = Record<string, string | number | boolean>

count(name: string, value?: number, attrs?: MetricAttrs): void
distribution(name: string, value: number, attrs?: MetricAttrs): void
gauge(name: string, value: number, attrs?: MetricAttrs): void
```

- **Noop** when Sentry is not initialized / in tests (unless a test injects a recording backend).
- **Sentry** backend: `Sentry.metrics.count` / `distribution` / `gauge` with `{ attributes, unit? }`. Wire once at process boot next to `initSentry` (when DSN is set).
- **Fail-open:** wrap every emit in try/catch; never throw into WarEra or cache paths.
- Later Prometheus is a new backend behind this API.

Attribute rules: bounded enums only (`procedure`, `call_class`, `outcome`, `cache_kind`, `result`). Never user/player ids, `request_id`, `job_run_id`, or raw URLs.

### Day-one signals

**Per procedure slot**

| Name | Type | Attrs |
| --- | --- | --- |
| `warera.upstream.call` | count | `procedure`, `call_class`, `outcome` |

**Per HTTP request**

| Name | Type | Attrs |
| --- | --- | --- |
| `warera.upstream.latency_ms` | distribution (unit: millisecond) | `call_class`, `outcome` |
| `warera.upstream.batch_size` | distribution | `call_class` (1 for a single GET) |
| `warera.upstream.response_bytes` | distribution | `call_class` |
| `warera.upstream.rate_limit_wait_ms` | distribution | `reason`: `local_budget` \| `header_exhausted` \| `http_429` |
| `warera.upstream.rate_limit_remaining` | gauge | none |

**Dedup**

| Name | Type | Attrs |
| --- | --- | --- |
| `warera.upstream.dedup_join` | count | `procedure`, `call_class` |

**L1 (thin)**

`getCached` / `getOrFetch` emit `cache.l1.lookup` with `cache_kind` (default `"kv"`) and `result`: `hit` \| `miss` \| `stale`. Export `recordCacheLookup(cache_kind, result)` for dedicated tables to opt in later. Do **not** retrofit price/region/MU SQL readers in this pass.

A 429 that is recovered by waiting is **not** a Sentry Issue. Issues remain for exhausted failures that already log at `error`/`fatal`.

## Call sites and files

| File | Responsibility |
| --- | --- |
| `src/warera/client.ts` | Facade orchestration: class inference, dedup, batch flush, governor, metrics, fetch |
| `src/warera/governor.ts` | Local RPM + header state + global pause |
| `src/warera/batch.ts` | Window queue and 50-slot chunking; call existing `trpc.ts` URL-length helpers |
| `src/warera/dedup.ts` | In-flight map keyed as specified |
| `src/warera/rate-limit.ts` | Keep as the local sliding-window primitive; only the governor calls `acquire` |
| `src/metrics/index.ts` (+ noop / sentry backends) | Process-wide metrics API |
| `src/logging/context.ts` | `getLogContext()` |
| `src/config/env.ts` | Default base URL → api2 |
| `src/db/cache.ts` | L1 lookup metric + `recordCacheLookup` |
| Typed helpers under `src/warera/` | Drop redundant `baseUrl`; keep `authStyle: "api-key"` where needed |
| `.agents/skills/warera-api/SKILL.md` | api2 default; drop “prefer gateway”; document 50-cap and header governor |
| `docs/warera-api/inventory.md` | Client defaults + per-resource “Upstream today” → api2 |

Env knobs: `WARERA_MAX_REQUESTS_PER_MINUTE` stays (default 120). Batch window is the constant `400` ms; max batch slots is the constant `50`. New procedures remain allowlisted typed helpers, not a generated RPC client.

## Testing

- Governor: header parse; wait when `remaining === 0`; 429 pauses a **second** concurrent request; `Retry-After` wins; local 120 still serializes.
- Retry: 3× 5xx then throw; 404 does not retry; 429 waits reset then succeeds.
- Batch: 51 items → two HTTP calls (50 + 1); GET over URL cap still splits; GET+POST do not mix.
- Dedup: two concurrent identical singles → one fetch.
- Call class: `withLogContext({ job_id })` → background window; `{ request_id }` → no 400ms wait.
- Metrics: recording backend sees `outcome: rate_limited` on 429; Noop does not throw.
- Client: no gateway fallback on 404 / “unknown method”.
- Existing helper tests keep passing after `baseUrl` default change.

## Error handling

- Facade throws the same `Error` shape as today (`WarEra request failed: <status> <snippet>`) so jobs/routes do not need a new error type in this pass.
- Metrics/log failures never change that throw path.
- Shutdown: no new resources that require close beyond existing `fetch` / Sentry `close`.

## Out of scope

- Job cron strings, pack TTLs, inventory “target freshness” edits
- Event-driven Geo (`enqueueGeoRefresh`), L2 process memory cache
- TanStack Query persistence / L4 API payloads
- Domain package rewrite
- Prometheus, in-app metrics UI, browser L3/L4 metrics
- Porting the Python client’s SWR cache, 5ms auto-batch, or HIGH-priority flush
- Smart split-on-response-size (metrics only)
- Site auth / multi-tenant concerns

## Success criteria

- All WarEra HTTP goes through this client to api2; community gateway is not required for normal operation
- 429 / `remaining === 0` pauses the whole process until `ratelimit-reset`, then retries (bounded)
- Batches never exceed 50 slots
- Sentry Metrics (or Noop) can answer: volume by procedure/class/outcome, batch size, response bytes, wait time, remaining quota, dedup joins
- Adding a procedure, a metric name, or a governor knob does not need another architecture pass
