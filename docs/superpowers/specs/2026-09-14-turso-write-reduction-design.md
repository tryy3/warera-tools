# Turso Write Reduction — Design

**Date:** 2026-09-14  
**Status:** Approved for implementation  
**Depends on / extends:**

- [Donation Poll](./2026-09-03-donation-poll-design.md)
- [MU Member Activity Poll](./2026-09-04-mu-member-activity-poll-design.md)
- [Data Tier Caching Strategy](./2026-08-02-data-tier-caching-strategy-design.md)
- Region sync + job runner prune (existing code)

## Goal

Cut unnecessary Turso write (and pathological read) volume without changing job cadences or market-transaction ingestion:

1. Fix expensive `job_runs` pruning.
2. Stop hourly per-row full `regions` rewrites.
3. Make donation and user-profile snapshot history **sparse (delta-only)** via process-memory fingerprints warmed from Turso.

## Non-goals

- Slowing or disabling `item-market-tx-poll` / backfill
- Changing donation / mu-member / region cron expressions
- New “current state” tables or a local SQLite side-cache
- Disabling `example-heartbeat` (optional follow-up)
- Retention / prune of old snapshot history

## Decisions

| Topic | Choice |
| --- | --- |
| Delta strategy | Process-memory fingerprints + **lazy Turso warm** on miss |
| Profile “changed” | Any **stored content field** differs (exclude `poll_id` / `recorded_at`) |
| Donation “changed” | `amount` differs for `(scope_type, scope_id, user_id)`; new donors always insert |
| Empty delta polls | Always insert parent `*_polls` row; counts = snapshots actually written (may be 0) |
| Restart | Warm from Turso — no full rewrite burst when data unchanged |
| Region sync TTL | **12 hours**; only fetch when `fetched_at` is null or older than TTL |
| Region writes | Batched upserts; always set `fetched_at` on successful fetch so TTL advances |
| Market TX | Untouched |

## Architecture

```
[job completion]
  → pruneJobRuns: index-backed delete by cutoff id (skip if ≤ keep)

[region-sync] hourly
  → list regions where fetched_at IS NULL OR fetched_at < now - 12h
  → fetch WarEra for those ids
  → batch upsertRegionFetched (chunks)

[donation-poll] hourly / [mu-member-poll] every 5m
  → drain / batch-fetch as today
  → ensureWarmed(keys)  // Turso latest fingerprints for missing map keys only
  → filter to changed rows
  → insert *_polls (always)
  → insert *_snapshots (deltas only)
  → update in-memory map for written keys
```

Future time-window deltas remain valid: compare last snapshot at/before t0 vs t1 (sparse series). `getLatestUserProfile` unchanged.

## Components

### 1. `job_runs` prune

**Schema:** add index on `(job_id, started_at, id)` (descending order not required for SQLite B-tree range deletes).

**Logic (`pruneJobRuns`):**

1. If `keep === 0`, delete all for `job_id` (existing).
2. Select newest `keep` ids ordered by `started_at DESC, id DESC`.
3. If fewer than `keep` rows, return (no delete).
4. Else delete where `job_id = ? AND id < cutoffId` where `cutoffId` is the oldest kept id (the `keep`-th row’s id).  
   Equivalent safer form: delete rows for `job_id` whose `(started_at, id)` is strictly older than the cutoff row — prefer **id cutoff only when ids are monotonic autoincrement**, which they are.

Do **not** use `NOT IN (…50 ids)`.

### 2. Region sync

- `listRegionsForSync` (or a new helper) filters by TTL **12h** (named constant).
- `upsertRegionFetched` gains a batch API (multi-row `INSERT … ON CONFLICT DO UPDATE`) in chunks (e.g. 50–100).
- Loop: fetch from WarEra per stale id (API still one-at-a-time); buffer successful results; flush batch upserts.
- On successful fetch, always write `fetched_at = now` even if `name` / `country_code` unchanged.

### 3. Snapshot fingerprint cache

Shared small helper (name flexible), used by donation + profile jobs:

- In-process `Map<string, string>`.
- `ensureWarmed(db, keys, loader)`: for keys not in the map, call `loader(missingKeys)` once, fill map.
- After successful snapshot insert, set map entries for written rows.
- On warm or insert failure: do not mark keys as warmed incorrectly; failed insert leaves cache stale so a retry may rewrite (safe).

**Donations**

- Key: `` `${scopeType}:${scopeId}:${userId}` ``
- Fingerprint: canonical string for `amount` (`null` ≠ `0`).
- Warm loader: latest amount per key for the drained set (SQLite window or `MAX(poll_id)` join).
- Compare only successfully drained scopes’ rows.

**Profiles**

- Key: `userId`
- Fingerprint: stable serialization of all `UserProfileSnapshotRow` fields except `recordedAt` (and never `pollId`). Dates as epoch ms.
- Warm loader: latest snapshot content fields per `userId` in the poll member set.
- `user_count` on the poll row = number of snapshot rows written.

### 4. Inventory doc

Update `docs/warera-api/inventory.md`: donation and MU member profile storage are **append-on-change** (sparse), with poll parent rows every run.

## Error handling

| Case | Behavior |
| --- | --- |
| Fingerprint warm query fails | Fail the poll; no snapshot writes; no cache poison |
| Snapshot insert fails | Propagate error; do not update cache for that batch |
| Single donation scope drain fails | Existing `partial` behavior; other scopes still delta-filtered |
| Region fetch fails for one id | Existing per-id warn + continue; do not advance that id’s `fetched_at` |

## Testing

- **Prune:** under-limit no-op; over-limit deletes older only; keeps newest `keep`.
- **Region-sync:** fresh regions skipped; null/`fetched_at` past TTL synced; batch upsert path covered.
- **Donations / profiles:** identical second poll → poll row + 0 snapshots; field/amount change → one snapshot; warm-from-DB then identical data → 0 snapshots (no rewrite).

## Success criteria

- Turso no longer shows multi-million-row-read `job_runs` deletes from `NOT IN` prunes.
- `regions` upsert statement count drops from ~every-region-every-hour to ~stale-set / 12h, batched.
- Steady-state donation/profile snapshot writes track real changes, not full roster × cadence; restart does not force a full rewrite when Turso warm succeeds.
