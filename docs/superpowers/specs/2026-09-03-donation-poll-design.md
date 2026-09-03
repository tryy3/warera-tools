# Donation Poll — Design

**Date:** 2026-09-03  
**Status:** Approved for implementation  
**Depends on / extends:**

- [Data Tier Caching Strategy](./2026-08-02-data-tier-caching-strategy-design.md) (Geo watchlist + job)
- [MU Stats Poll](./2026-08-03-mu-stats-poll-design.md) (snapshot pattern; reuse `mu_watch_reasons`)
- [Followed Entities / Work Stats](./2026-08-20-followed-entities-work-stats-design.md) (`*_watch_reasons` shape)
- Price-poll / MU-poll pattern (`*_polls` / `*_snapshots`) as the history template

## Goal

Collect per-donor **running donation totals** for watched Military Units and watched countries so we can later compute daily/weekly deltas and MU-vs-country oversight for members. **No UI or public API routes in this slice** — job + schema + WarEra client only.

## Decisions

| Topic | Choice |
| --- | --- |
| Data tier | **Geo** — watchlist-driven Croner job owns refresh |
| MU scopes | Distinct ids from existing `mu_watch_reasons` (watching an MU ⇒ poll its donations) |
| Country scopes | New `country_watch_reasons`; **any reason ⇒ donation poll** |
| Party | Recognized in `scope_type` enum; **never enqueued or polled in v1** |
| Upstream procedure | `donation.getManyPaginated` (**api2 override** — not on official OpenAPI; works on live api2) |
| Page size | `limit: 100` (API max); follow `nextCursor` until exhausted |
| Semantics | Each API row is one donor’s **running total** for that scope (mutated over time); not a per-event ledger |
| Storage | Append-only snapshots of those totals; later read layer diffs two polls for period deltas |
| Snapshot shape | Single `donation_snapshots` table with `scope_type` + `scope_id` discriminator |
| Cadence | Every **hour** (`0 0 * * * *`) |
| Retention | Keep forever for now (no prune in v1) |
| Country seed | Sweden WarEra id `6813b6d446e731854c7ac7f2` with reason `manual` / source `""` |
| UI / routes | Out of scope |
| `donation.getTotalDonations` | Out of scope (aggregates only; we need per-donor rows) |

## Architecture

```
[country_watch_reasons]   manual Sweden now; later mu_home / member_citizenship / …
[mu_watch_reasons]        already exists — reused as MU donation scopes

[donation-poll] every hour
  → distinct MU ids from mu_watch_reasons
  → distinct country ids from country_watch_reasons
  → for each (scope_type, scope_id):
       drain donation.getManyPaginated (limit 100, cursor)
  → insert donation_polls
  → append donation_snapshots (one row per donor per scope per poll)

[Future UI / APIs]
  → join roster members to MU + country snapshot series
  → weekly/daily deltas = amount(t1) − amount(t0) per (scope, user)
  → rankings / “achievements” over raw snapshot history
```

`countries` + `country-sync` remain the **full catalog** (names, tax). `country_watch_reasons` is only for **expensive selective work** (donations now; other heavy country jobs later).

## Data model

### `country_watch_reasons`

Same shape as `mu_watch_reasons` / `player_watch_reasons`:

| Column | Type | Notes |
| --- | --- | --- |
| `country_id` | text | WarEra country id |
| `reason` | text | e.g. `manual` (v1); later `mu_home`, `member_citizenship`, … |
| `source_id` | text | Source of the reason; empty string for manual (`MANUAL_SOURCE_ID`) |
| `last_touched_at` | timestamp | |
| `created_at` | timestamp | |

Primary key: `(country_id, reason, source_id)`. Inserts use `onConflictDoNothing`. Jobs poll `DISTINCT country_id`.

**Seed:** ensure row `(6813b6d446e731854c7ac7f2, manual, "")` exists (migrate and/or job startup), same spirit as the MU seed.

### `donation_polls`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer PK | Auto-increment |
| `recorded_at` | timestamp | Poll clock time |
| `status` | text | `success` \| `partial` \| `error` |
| `error` | text? | Summary when not fully successful |
| `scope_count` | integer | Scopes with a successful drain this poll |
| `row_count` | integer | Snapshot rows written |

Index: `(status, recorded_at)` (same spirit as price / MU polls).

### `donation_snapshots`

One row per donor per scope per poll.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer PK | |
| `poll_id` | integer | FK → `donation_polls.id` |
| `scope_type` | text | `mu` \| `country` (\| `party` reserved — never written in v1) |
| `scope_id` | text | MU id or country id |
| `user_id` | text | Donor WarEra user id |
| `donation_row_id` | text? | Upstream `_id` |
| `amount` | real | Running total from API |
| `donation_created_at` | timestamp? | Upstream `createdAt` |
| `donation_updated_at` | timestamp? | Upstream `updatedAt` |
| `payload` | json? | Unknown leftovers |

Index: `(scope_type, scope_id, user_id, poll_id)`.

**Mapping from API:** each item has exactly one of `muId` / `countryId` / `partyId` set. Parser maps that to `(scope_type, scope_id)`. Rows that would resolve to `party` are skipped in v1 (should not appear under MU/country queries).

**Cost note:** there is no cheap “since last poll” filter. Every run fully drains the donor list for each scope. Cost scales with distinct lifetime donors in scope, not with new activity between polls. Hourly cadence is the chosen middle ground.

## Job: `donation-poll`

| Field | Value |
| --- | --- |
| Id | `donation-poll` |
| Default cron | `0 0 * * * *` (hourly at :00) |
| Default enabled | `true` |

### Run steps

1. Ensure Sweden `manual` country watch reason exists.
2. Build scope list: `(mu, id)` from `listDistinctWatchedMuIds` + `(country, id)` from `listDistinctWatchedCountryIds`.
3. For each scope (continue on per-scope errors):
   - Drain `donation.getManyPaginated` with `{ muId }` or `{ countryId }`, `limit: 100`, follow `nextCursor` until exhausted.
   - Buffer snapshot rows.
4. Insert `donation_polls` with aggregated status:
   - `success` — all scopes fully drained
   - `partial` — at least one scope succeeded; some failed
   - `error` — no usable snapshots
5. Insert buffered `donation_snapshots`.
6. Log flat primitives: `{ poll_id, scope_count, row_count, status, … }`.

### Partial failure

- One scope’s drain fails → skip its snapshots; continue others; poll status ≥ `partial`.
- Empty donor list for a scope → success for that scope with 0 rows.

## WarEra client

- New helper under `src/warera/` (e.g. `donations.ts`): parse item → snapshot fields; drain all pages.
- Document as intentional OpenAPI override (same class as `muMember.getByMu`).
- Use existing `createWareraClient` / rate limiter — no parallel HTTP stack.
- Prefer GET when it works; fall back to POST + `X-API-Key` if live api2 requires it (same pattern as other undocumented reads).
- Update warera-api skill allowlist note when implementing.

Observed item shape (live api2):

```json
{
  "_id": "...",
  "muId": "...",
  "countryId": null,
  "partyId": null,
  "userId": "...",
  "amount": 3080,
  "createdAt": "2026-04-20T08:27:34.084Z",
  "updatedAt": "2026-09-03T06:57:17.251Z"
}
```

Pagination: `{ items, nextCursor }`.

## Out of scope

- Any Web UI, charts, or Hono read routes / weekly-diff helpers
- Auto-enqueue from MU home country or member citizenship
- Party polling / party watchlist
- Snapshot pruning / retention windows
- Resolving donor usernames / avatars
- `donation.getTotalDonations`
- Discord notifications

## Testing

- Parser unit tests with fixtures shaped like live MU-scoped and country-scoped pages (including cursor chaining).
- Watch-reasons helpers: insert idempotent, list distinct country ids, delete by reason+source.
- Job `run` test with mocked requester: seed MU + Sweden country reasons; assert poll + snapshots; assert `partial` when one scope fails.
- No route/UI tests in this slice.

## Docs to update (implementation)

- `docs/warera-api/inventory.md` — Geo: country watchlist + donation snapshots resource
- `.agents/skills/warera-api/SKILL.md` — note `donation.getManyPaginated` override

## Success criteria

1. After migrate + app start, Sweden is on `country_watch_reasons` (`manual`).
2. Job runs on an hourly cron and is visible in the existing Jobs registry/UI.
3. Each successful run appends one `donation_polls` row and typed `donation_snapshots` for watched MUs and countries.
4. No UI changes required to start collecting data.
