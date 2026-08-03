# MU Stats Poll — Design

**Date:** 2026-08-03  
**Status:** Approved for implementation  
**Depends on / extends:**

- [Data Tier Caching Strategy](./2026-08-02-data-tier-caching-strategy-design.md) (MU as Geo watchlist + job)
- [Warera Toolkit Foundation](./2026-07-31-warera-toolkit-foundation-design.md) (Croner jobs, Turso)
- Price-poll pattern (`price_polls` / `price_snapshots`) as the history template

## Goal

Gather Military Unit (MU) identity and time-series stats in the background so we can build graphs and tools later. **No UI or public API routes in this slice** — job + schema + WarEra client only.

## Decisions

| Topic | Choice |
| --- | --- |
| Data tier | **Geo** — watchlist table + Croner job owns refresh |
| Watchlist | DB `mus` row presence = poll this MU (same idea as `regions`) |
| Initial seed | MU id `69e5dc36f7b095e977052f7b` (“Sweed Liberty”); insert if missing when watchlist empty / on migrate |
| Current vs history | Identity, roster, presentation → **current rows**; counters / ranking stats → **append-only snapshots** |
| Column style | Prefer **typed columns** for known scalars; **JSON** only for nested objects or unknown leftovers (`payload`) |
| Cadence | Every **30 minutes** |
| Retention | Keep forever for now (no prune in v1) |
| Procedures | `mu.getById` (official allowlist); `muMember.getByMu` (**api2 override** — not on official OpenAPI; works on live api2) |
| Host | Prefer gateway for `mu.getById`; `muMember.getByMu` via gateway→api2 fallback or force api2 |
| UI / routes | Out of scope |

## Architecture

```
[mu-stats-poll] every 30m
  → ensure seed MU on empty watchlist
  → for each mus.id:
       mu.getById          → upsert mus + replace mu_members (roster/roles)
       muMember.getByMu    → member counter rows for this poll
  → insert mu_polls
  → append mu_stat_snapshots + mu_member_stat_snapshots

[Future UI / APIs]
  → read mus / mu_members for “now”
  → read snapshots joined to mu_polls for charts
```

## Data model

### Classification rule

| Kind | Storage |
| --- | --- |
| Name, avatar, country, region, owner, upgrades, roles, member list | Current tables |
| Ranking values (damage, bounty, reputation, terrain, wealth, …) | `mu_stat_snapshots` |
| Per-member damage/help totals (total / monthly / weekly) | `mu_member_stat_snapshots` |

### `mus` (watchlist + current entity)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | WarEra MU id; row existence = watchlist |
| `name` | text? | |
| `avatar_url` | text? | |
| `country_id` | text? | |
| `region_id` | text? | |
| `owner_user_id` | text? | API field `user` |
| `mercenary_reputation` | real? | Current scalar on entity |
| `level` | integer? | From `leveling.level` (current display) |
| `created_at_game` | timestamp? | API `createdAt` |
| `roles` | json? | `{ managers, commanders }` |
| `active_upgrade_levels` | json? | e.g. headquarters / dormitories |
| `payload` | json? | Unknown / leftover fields |
| `enqueued_at` | timestamp | First watchlist insert |
| `fetched_at` | timestamp? | Last successful `getById` |

### `mu_members` (current roster)

| Column | Type | Notes |
| --- | --- | --- |
| `mu_id` | text | FK → `mus.id` |
| `user_id` | text | Member user id |
| `role` | text? | Derived: `owner` / `manager` / `commander` / `member` (or null) |
| `updated_at` | timestamp | Last roster sync |

Primary key: `(mu_id, user_id)`. Each poll **replaces** the set for that MU (delete missing, upsert present). No historical membership table in v1.

### `mu_polls`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer PK | Auto-increment |
| `recorded_at` | timestamp | Poll clock time |
| `status` | text | `success` \| `partial` \| `error` |
| `error` | text? | Summary when not fully successful |
| `mu_count` | integer | MUs with a MU-level snapshot written |
| `member_count` | integer | Member snapshot rows written |

Index: `(status, recorded_at)` (same spirit as price polls).

### `mu_stat_snapshots`

One row per MU per poll. Ranking **values** (and ranks/tiers as typed scalars) from `mu.getById.rankings`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer PK | |
| `poll_id` | integer | FK → `mu_polls.id` |
| `mu_id` | text | |
| `weekly_damages` | real? | `rankings.muWeeklyDamages.value` |
| `weekly_damages_rank` | integer? | |
| `weekly_damages_tier` | text? | |
| `bounty` | real? | `muBounty` |
| `bounty_rank` | integer? | |
| `bounty_tier` | text? | |
| `reputation` | real? | `muReputation` |
| `reputation_rank` | integer? | |
| `reputation_tier` | text? | |
| `damages` | real? | `muDamages` |
| `damages_rank` | integer? | |
| `damages_tier` | text? | |
| `terrain` | real? | `muTerrain` |
| `terrain_rank` | integer? | |
| `terrain_tier` | text? | |
| `wealth` | real? | `muWealth` |
| `wealth_rank` | integer? | |
| `wealth_tier` | text? | |
| `leveling_level` | integer? | `leveling.level` at poll time |
| `leveling_monthly_damages` | real? | `leveling.monthlyDamages` (counter → snapshot) |
| `payload` | json? | Extra ranking keys / unknown nested leftovers |

Index: `(mu_id, poll_id)`.

`mus.level` is the latest display copy; `leveling_*` on the snapshot preserve history for charts.

### `mu_member_stat_snapshots`

One row per member per poll from `muMember.getByMu`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer PK | |
| `poll_id` | integer | FK → `mu_polls.id` |
| `mu_id` | text | API `mu` |
| `user_id` | text | API `user` |
| `member_row_id` | text? | API `_id` (membership stats document id) |
| `total_damages_count` | integer? | |
| `monthly_damages_count` | integer? | |
| `weekly_damages_count` | integer? | |
| `total_help_count` | integer? | |
| `monthly_help_count` | integer? | |
| `weekly_help_count` | integer? | |
| `payload` | json? | Unknown extras |

Index: `(mu_id, user_id, poll_id)`.

## Job: `mu-stats-poll`

| Field | Value |
| --- | --- |
| Id | `mu-stats-poll` |
| Default cron | `0 */30 * * * *` (every 30 minutes at :00 and :30) |
| Default enabled | `true` |

### Run steps

1. List `mus.id`. If empty, insert seed id `69e5dc36f7b095e977052f7b` with `enqueued_at = now`.
2. For each MU (continue on per-MU errors):
   - Fetch `mu.getById`.
   - Upsert `mus` current columns; set `fetched_at`.
   - Sync `mu_members` from `members` + `roles`.
   - Fetch `muMember.getByMu`.
   - Buffer MU ranking snapshot + member snapshots.
3. Insert `mu_polls` with aggregated status:
   - `success` — all watchlist MUs fully snapshotted (MU + members)
   - `partial` — at least one MU succeeded enough to write some snapshots; some failures
   - `error` — no usable snapshots
4. Insert buffered snapshot rows.
5. Log: `{ pollId, muCount, memberCount, status, errors }`.

### Partial failure detail

- `getById` fails → skip that MU entirely for this poll (no current upsert change required; leave previous current rows).
- `getById` ok, `muMember.getByMu` fails → still upsert current `mus` / `mu_members`; write **MU** stat snapshot; skip member snapshots for that MU; poll status ≥ `partial`.

## WarEra client

- New helpers under `src/warera/` (e.g. `mu.ts`): parse + fetch `mu.getById` and `muMember.getByMu`.
- Use existing `createWareraClient` / rate limiter — no parallel HTTP stack.
- **`muMember.getByMu`:** document as intentional OpenAPI override (same class as `company.getRecommendedRegionIdsByItemCode`). Prefer calling api2 directly if gateway miss is noisy; otherwise rely on existing gateway→api2 fallback for unknown method.
- Update warera-api skill allowlist note when implementing (procedure used under documented override).

## Out of scope

- Any Web UI, charts, or Hono read routes
- Auto-resolving MU from username `tryy3` each run
- Event-driven `enqueueGeoRefresh` for MUs
- Snapshot pruning / retention windows
- Resolving member usernames / avatars
- Discord notifications

## Testing

- Parser unit tests with fixtures shaped like live `mu.getById` / `muMember.getByMu` responses.
- Job `run` test with mocked requester: seed watchlist, assert current upserts + poll + snapshots; assert `partial` when member fetch fails.
- No route/UI tests in this slice.

## Success criteria

1. After migrate + app start, seed MU is on the watchlist.
2. Job runs on a 30-minute cron and is visible in the existing Jobs registry/UI.
3. Each successful run appends one poll and typed MU + member snapshots.
4. `mus` / `mu_members` reflect the latest identity and roster without scanning history.
5. No UI changes required to start collecting data.
