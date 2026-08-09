# WarEra access & caching vision

**Date:** 2026-08-06  
**Status:** Directional architecture (not an implementation plan)  
**Based on:** [inventory.md](./inventory.md)  
**Tier rules:** [Data tier caching strategy](../superpowers/specs/2026-08-02-data-tier-caching-strategy-design.md)

## Goals

1. **Move off the community gateway** as the default path — talk to **api2** only for normal operation, without stampeding rate limits.
2. **Understand and tune freshness** — inventory current cadence vs needed freshness; raise TTLs / slow jobs where safe.
3. **Standardize caching** across server and browser (including localStorage where it helps UX) so tools don’t invent one-off stores.
4. Keep **domain math** and **observability** coherent enough that we don’t fork formulas or fly blind on api2 pressure.
5. **Prefer the stack we already have** — deepen existing libraries before inventing parallel mechanisms or adding new deps (see below).

This doc is architectural direction. Exact cron strings, class names, and rollout PRs belong in later implementation plans.

## Prefer existing libraries & stack

When implementing pieces of this vision (caching, prefetch, queues, DB helpers, HTTP internals), default to **using more of what we already ship**, then small custom code, then new libraries — in that order.

### Decision guide

| Situation | Prefer |
| --- | --- |
| Simple or highly custom behavior (our rate-limit governor, WarEra-specific batching policy, domain formulas) | **Build it ourselves** in-process — especially when we need tight control |
| Larger / generic capability we don’t want to own (charts, DB drivers, complex UI data grids, etc.) | **Investigate existing libs** — we already have most large pieces; new deps should be rare and justified |
| Feature already covered by an **installed** library | **Use more of that library** — don’t fear unused APIs just because we only adopted a thin slice so far |

### Stack to check first (non-exhaustive)

| Area | Look at before rolling our own |
| --- | --- |
| **TanStack Query** (already in use) | Persistence / dehydrate, prefetching, staleTime/gcTime tuning, placeholderData, query invalidation patterns, structural sharing — especially for L3/L4 UX (jump between tools, warm cache after Load) |
| **Other TanStack** (Router, Charts, Table, …) | Features we already depend on but underuse; sibling libs only when a real gap appears |
| **Hono** | Middleware, context helpers, caching/validation patterns, or other server primitives that fit the access facade / API layer |
| **Turso / libSQL / Drizzle** | Extra or experimental features (replication, embedded replicas, batch SQL, etc.) when they improve L1/L2 without a new store |

The access facade itself is intentionally **custom** (WarEra egress policy). Client cache UX and generic server plumbing should still ask: “Does Query / Hono / Turso already solve most of this?”

## Access facade (in-process)

Build something *like* the community gateway — caching policy, batching, dedup, rate-limit awareness — but as an **in-process service/facade** inside our existing Node server, optimized for **our** jobs and interactive loads (not the public internet).

```
Jobs / Hono / domain loaders
        │
        ▼
┌───────────────────────────────┐
│  WarEra access facade         │
│  - call class (interactive /  │
│    background)                │
│  - batch window + flush       │
│  - in-flight dedup            │
│  - rate-limit governor        │
│  - structured metrics/logs    │
└───────────────┬───────────────┘
                │
                ▼
         api2.warera.io/trpc
```

### Responsibilities

| Concern | Direction |
| --- | --- |
| Single egress | All outbound WarEra HTTP goes through the facade; no parallel `fetch` stacks |
| Upstream | **api2 only** for normal operation; drop gateway preference over time |
| Call classes | `interactive` (user waiting) vs `background` (jobs / warmups) |
| Batching | Background: coalesce into tRPC batch windows (~400ms). Interactive: batch within one request graph, then flush immediately when under budget |
| Dedup | Same procedure + input in flight → one upstream call, many waiters |
| Rate limits | Soft local budget **plus** WarEra response headers / 429 → pause/resume instead of stampede |
| Observability | Emit structured fields for procedure, call class, outcome, latency, remaining budget |

### Non-responsibilities

- Owning Turso tables or business formulas
- Being a multi-tenant public cache for other apps
- Replacing Croner — jobs still decide *when* domain work runs; the facade decides *how* HTTP leaves

### Relationship to today’s client

Evolve `createWareraClient` / `src/warera/*` helpers into callers **of** the facade (or the facade becomes that client). Typed procedure helpers stay; raw egress policy centralizes.

## Cadence & freshness policy

The facade protects the budget; **cadence policy reduces how often we ask**.

### Principles

1. Freshness is a product choice per resource — not “as often as possible.”
2. Jobs remain the bulk WarEra callers for Global/Geo; interactive path for User (+ rare cold misses).
3. Append/catch-up streams may poll often but stay **narrow and incremental**; latest-entity data usually wants longer baselines.
4. Geo should trend toward **longer baseline + event-driven bump** (`enqueueGeoRefresh`), with sweep jobs as backstop — quiet regions need not refresh like war regions.

### Policy classes

| Class | Typical need | Direction |
| --- | --- | --- |
| Live-on-demand | User packs, shell Load | Short server TTL; no per-user cron; interactive class |
| Periodic shared | Prices, recommended regions | Job-owned; prefer hourly or slower unless a tool proves tighter need |
| Watchlist / eventual | Regions, countries, MU | Longer baseline + event bumps; avoid high-frequency full sweeps |
| Append / catch-up | Item-market transactions | Higher frequency OK with cursor/handoff — never full refetch |

### Inventory → decisions

Each inventory row should grow an explicit **target freshness** (e.g. ≤1h, ≤1d, on Load, near-real-time stream) separate from **current cron**. If current cron is tighter than target → candidate to relax, validated with facade metrics.

## Cache matrix

Standardize *where* data lives. Layers complement the facade; they do not replace it.

| Layer | Scope | Role |
| --- | --- | --- |
| **L0** | Process | Facade in-flight dedup / batch coalesce |
| **L1** | Shared server | Turso SoT — latest snapshot, append-only history, or TTL pack/KV |
| **L2** | Process (optional later) | In-memory hot cache across users — design-ready; enable when multi-user justifies it |
| **L3** | Browser tab | TanStack Query — primary cross-tool session cache (prefer Query features: prefetch, stale/gc tuning, etc.) |
| **L4** | Browser durable | Prefer Query persistence / dehydrate where it fits; otherwise versioned localStorage for small, high-value payloads within TTL — not Geo dumps or secrets |

### Rules of thumb

1. Classify by **tier** first, then pick layers.
2. **L1 is SoT for Global/Geo**; the browser reads *our* API, not WarEra.
3. **User:** L1 short TTL + L3 always; L4 optional so reload still “feels loaded” within TTL.
4. **Global hot summaries:** L1 + shared L3 keys; L4 only if UX needs continuity and payload stays small.
5. Prefs (recent players, equipment prefs) stay **prefs**, not mixed blindly with TTL’d API caches — use clear versioned key schemes.
6. New features answer: which layers, what stale/TTL, who invalidates (job / Load / expiry)?

## Domain library (directional)

- Treat `src/calculator/`, `src/economy/`, `src/growth/`, `src/market/` (+ game-mechanics skill) as the **internal domain API**.
- Domain code consumes already-fetched data; it does not own WarEra egress (facade does).
- Prefer one obvious entry per concern over copy-pasted formula fragments across tools.
- Maintain a short map (here or a later `docs/warera-api/domain.md`) of concern → module; formula detail stays in the game-mechanics skill.

**Non-goal:** Big-bang merge of all packages into one mega-lib.

## Observability (directional)

Leaving the gateway means **we** must see volume, pressure, and failures.

- Facade logs structured fields: `warera_procedure`, `call_class`, `outcome` (`ok` | `error` | `dedup_join` | `batched` | `rate_limited_wait`), latency, header-derived budget when present.
- Correlate with existing `request_id` / `job_id` / `job_run_id`.
- Sentry: Issues for errors; Logs (+ later simple counters) for requests/min, wait time, 429s, dedup hits.
- Success bar: we can answer “how hard are we hitting api2?” without guessing.

**Non-goal:** Full custom metrics product / dashboard app in this vision.

## Suggested sequencing

1. Keep **inventory** accurate (ongoing).
2. **Facade skeleton** — single egress, call classes, header-aware governor, structured logs (gateway may still be allowed during transition).
3. **Batching + in-flight dedup**.
4. **api2-only cutover** — remove gateway default; keep allowlist discipline from the warera-api skill.
5. **Cadence pass** — target freshness vs metrics → relax safe jobs/TTLs.
6. **Cache matrix** — shared TQ keys; explore Query prefetch/persistence before bespoke LS; versioned LS only where Query doesn’t fit.
7. Deepen **domain map** and **metric counters** as needed.
8. Ongoing: when designing each slice, **check existing stack docs** (Query, Hono, Turso, …) for features we aren’t using yet.

## Non-goals

- Separate deployable public gateway service
- Full transactional history for every entity
- Site auth / multi-tenant product concerns in this workstream
- Implementing battle/law event producers in this doc (only the Geo enqueue direction)
- Rewriting all domain packages at once
- Full custom metrics UI

## Success criteria

- All WarEra HTTP goes through one in-process facade
- Default upstream is api2; gateway is not required for normal operation
- We can observe and stay under rate limits without community-gateway caching
- Inventory + cache matrix make “where does this live / how fresh?” answerable the same way across tools
