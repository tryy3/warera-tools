# Item Market Transactions Poll — Design

**Date:** 2026-08-04  
**Status:** Approved for implementation  
**Depends on / extends:**

- [Data Tier Caching Strategy](./2026-08-02-data-tier-caching-strategy-design.md) (Global tier + Croner jobs)
- [Warera Toolkit Foundation](./2026-07-31-warera-toolkit-foundation-design.md) (Croner jobs, Turso)
- [MU Stats Poll](./2026-08-03-mu-stats-poll-design.md) (typed columns + JSON leftovers; job-only v1)
- WarEra allowlist: `transaction.getPaginatedTransactions` ([warera-api skill](../../../.agents/skills/warera-api/SKILL.md))

## Goal

Ingest **sold** item-market equipment/weapon transactions (`transactionType: "itemMarket"`) into append-only history so we can later chart prices by item code and skills, and judge whether a listing is a fair deal for a sustain build.

Live offer / “good trade now” APIs are not allowed outside the game; completed sales via the gateway are.

**No UI or public API routes in this slice** — schema + WarEra client + jobs + small job-runner infra only.

## Decisions

| Topic | Choice |
| --- | --- |
| Data tier | **Global** — Croner owns refresh; tools later only read DB |
| Scope of txs | All `itemMarket` sales (not `trading` commodities — those already have `price-poll`) |
| Dedup | WarEra transaction `_id` as primary key; insert conflict-do-nothing |
| Column style | Typed scalars; **JSON** for `skills` (varying keys) and leftover `payload` |
| Retention | Keep forever for now (no prune in v1) |
| Host | Prefer gateway; fall back to api2 |
| UI / routes | Out of scope |
| Cold / catch-up | Dual jobs: slow **backfill** (once per process) + frequent **poll** |
| Poll vs backfill race | In-process **handoff flag**; poll never calls the API until backfill’s first successful page |
| Job overlap | Croner `protect` **on** for all jobs; protect callback records a **failed** `job_runs` row (visible overrun signal) |
| One-shot jobs | `jobs.max_runs` column → Croner `maxRuns` (NULL = infinite); backfill uses `1` |
| Schedule tokens | **Do not** invent `@startup`; align with Croner (`maxRuns` + normal cron that fires soon after boot) |
| Backfill depth | ~24h wall clock on `createdAt`, or known `_id`, whichever first |
| Poll stop | Known `_id` on a page (or empty page / no cursor) — no time budget |
| Failed backfill | Do **not** hand off to poll (avoid spamming a broken API); investigate manually |
| API backoff | Out of scope for v1; can add later inside backfill fetch |

## Architecture

```
boot → reconcileInterruptedRuns → startScheduler
  → item-market-tx-backfill (maxRuns=1, fires soon)
       → page itemMarket (delayed) newest → older
       → after 1st successful page: set handoff = true
       → stop at known _id OR createdAt < now-24h OR empty
  → item-market-tx-poll (every minute)
       → if !handoff: success "waiting for backfill handoff" (no API)
       → else: page newest → older until known _id
       → if still running when next tick fires: protect callback → failed run

[Future UI / APIs]
  → read item_market_transactions by item_code / created_at / skills
```

Shared ingest core used by both jobs: fetch page → map rows → insert-ignore → decide stop / next cursor.

## Job infrastructure changes

### `jobs.max_runs`

| Column | Type | Notes |
| --- | --- | --- |
| `max_runs` | integer nullable | `NULL` = infinite; `1` = once per Cron instance (per process boot) |

- `JobDefinition.defaultMaxRuns?: number`
- `syncJobsToDb`: on **insert** set `max_runs` from `defaultMaxRuns`; on conflict **do not** overwrite `max_runs`, `cron`, or `enabled` (same spirit as today’s cron seeding)
- `startScheduler` / `scheduleOne`: pass `maxRuns` into Croner when set

### Overrun protection (all jobs)

Keep Croner [`protect`](https://croner.56k.guru/usage/examples/#overrun-protection) enabled. Use a **callback** (not bare `true`) that:

1. Logs the blocked tick
2. Inserts a `job_runs` row with `status: error`, message like `job already running` / overrun, `duration_ms: 0`
3. Updates `jobs.last_status` / `last_error` accordingly

Manual `POST /run` overlap: same **fail** semantics (not silent skip). Stale `running` (>30m) and boot reconcile unchanged.

Peak load for the minute poll: overlapping attempts fail visibly until the long run finishes — intentional signal for cadence / volume.

## Jobs

### `item-market-tx-backfill`

| Field | Value |
| --- | --- |
| Id | `item-market-tx-backfill` |
| defaultCron | `* * * * * *` (every second; with `maxRuns: 1` ≈ once shortly after boot) |
| defaultMaxRuns | `1` |
| defaultEnabled | `true` |

Behavior:

1. Walk pages with inter-page delay (gentle; configurable constant, e.g. 200–500ms).
2. After **first successful page** (API OK, page handled): set in-process handoff flag `true`.
3. Stop when: any tx `_id` already in DB, or oldest `createdAt` on page older than **now − 24h**, or no next cursor / empty page.
4. Mid-page known id: insert newer unknown rows on that page, then stop (do not follow cursor).

### `item-market-tx-poll`

| Field | Value |
| --- | --- |
| Id | `item-market-tx-poll` |
| defaultCron | Every minute (6-field Croner) |
| defaultMaxRuns | unset (infinite) |
| defaultEnabled | `true` |

Behavior:

1. If handoff flag is `false`: return success with message `waiting for backfill handoff`; **no API calls**.
2. Else walk newest → older until known `_id` / empty (no 24h cap, no artificial time budget).
3. Long runs are fine; next minute’s tick becomes a protect failure until free.

### Handoff flag

- Module-level boolean, default `false` on process start.
- Set **only** after backfill’s first successful page.
- **Not** set when backfill fails before that page (poll stays dark).
- **Not** persisted to DB (a leftover `true` would race poll ahead of this boot’s backfill).
- Manual re-run of backfill while poll is live: leave flag `true` (v1); inserts remain idempotent.
- If backfill is **disabled** or never gets a successful page, poll stays dark by design — fix/enable backfill rather than auto-promoting poll.

## Data model

### `item_market_transactions`

Append-only. Primary key = WarEra transaction `_id`.

| Column | Source | Notes |
| --- | --- | --- |
| `id` | `_id` | text PK |
| `money` | `money` | real |
| `item_code` | `itemCode` | text; indexed with `created_at` |
| `quantity` | `quantity` | integer |
| `seller_id` | `sellerId` | text |
| `buyer_id` | `buyerId` | text |
| `transaction_type` | `transactionType` | text (`itemMarket`) |
| `item_id` | `item._id` | text |
| `item_type` | `item.type` | text? (`equipment`; weapons often omit → null) |
| `item_state` | `item.state` | integer? |
| `item_max_state` | `item.maxState` | integer? |
| `item_quantity` | `item.quantity` | integer? |
| `item_last_acquisition_at` | `item.lastAcquisitionAt` | timestamp? |
| `skills` | `item.skills` | json — e.g. `{ armor }`, `{ attack, criticalChance }`, … |
| `offer_created_at` | `offerCreatedAt` | timestamp? |
| `created_at` | `createdAt` | timestamp (sale time; used for 24h cutoff + charts) |
| `updated_at` | `updatedAt` | timestamp? |
| `payload` | leftovers | json? |
| `ingested_at` | our clock | timestamp |

Indexes: `(item_code, created_at)`, `(created_at)`.

No poll-parent table in v1 — each transaction row is the history unit.

## WarEra client

- New helper module (e.g. `src/warera/transactions.ts`): call `transaction.getPaginatedTransactions` with `transactionType: "itemMarket"` (+ cursor / page size as observed on the API).
- Parse `items[]` and next cursor (`cursor` / `nextCursor` — match live response; same flexibility as `company.getCompanies`).
- Prefer gateway base URL.

## Ingest walk (shared)

1. Request page (no cursor on first page of a run).
2. Map to row shape; `INSERT … ON CONFLICT DO NOTHING`.
3. If any id on the page already existed in DB before this insert (or conflict): treat as catch-up complete for further paging — after inserting any still-new rows on that page, stop.
4. Else if backfill and page’s oldest `created_at` &lt; now−24h: stop.
5. Else if no next cursor or empty items: stop.
6. Else set cursor and continue (backfill: delay first).

## Error handling

| Case | Behavior |
| --- | --- |
| Backfill page / API failure before handoff | Job errors; handoff stays false; poll waits |
| Backfill failure after handoff | Job errors; poll already enabled (may continue catch-up) |
| Poll waiting on handoff | Success, no API |
| Poll / backfill page failure mid-run | Fail the job run; partial inserts kept (idempotent) |
| Overlapping cron tick | Protect callback → failed run; work not double-started |
| Process crash mid-job | Existing reconcile interrupted runs |

## Testing

- DB: conflict-do-nothing; round-trip typed columns + `skills` JSON  
- Parser: equipment (`type` + single skill) and weapon (no `type`, multi skill) fixtures from observed payloads  
- Walk (mocked pages): mid-page known id stops further cursors; 24h cutoff; handoff only after first success; poll no-ops while flag false  
- Scheduler/runner: `maxRuns` wired; protect callback writes failed overrun run  

## Out of scope

- Market UI / charts / deal-scoring helpers  
- `trading` (commodity) transactions  
- Separate offline historical backfill script (possible later)  
- Retry / CD / backoff on transient API errors (follow-up inside fetch if needed)  
- Pausing poll when backfill is manually re-run  

## Implementation sketch (files)

| Area | Likely paths |
| --- | --- |
| Migration | `drizzle/0008_…` — `item_market_transactions` + `jobs.max_runs` |
| Schema / DB | `src/db/schema.ts`, `src/db/item-market-transactions.ts` |
| WarEra | `src/warera/transactions.ts` (+ tests) |
| Ingest | shared module under `src/jobs/item-market-tx-*/` or `src/market/` |
| Jobs | `item-market-tx-backfill`, `item-market-tx-poll`, registry |
| Infra | `src/jobs/types.ts`, `scheduler.ts`, `runner.ts`, `registry.ts` |
| Docs | `AGENTS.md` one-liner under Global / jobs |

## Non-goals / non-changes

- Changing `price-poll` or commodity price history  
- Changing MU stats poll behavior beyond shared runner protect/fail semantics  
