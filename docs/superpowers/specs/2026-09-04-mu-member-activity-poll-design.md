# MU Member Activity Poll — Design

**Date:** 2026-09-04  
**Status:** Approved for implementation  
**Depends on / extends:**

- [Data Tier Caching Strategy](./2026-08-02-data-tier-caching-strategy-design.md) (MU watchlist + jobs own Geo refresh)
- [MU Stats Poll](./2026-08-03-mu-stats-poll-design.md) (roster via `mu_members`; poll + append-only snapshot pattern)
- [Warera Toolkit Foundation](./2026-07-31-warera-toolkit-foundation-design.md) (Croner jobs, Turso)
- Followed-entities / `syncFollowedPlayers` (DB-first migration target)

## Goal

Background-collect typed **per-member profile and activity** history for everyone on watched MU rosters, every **5 minutes**, so we can later chart weekly activity, highlight strong contributors, and diagnose quiet members.

**No UI or public chart routes in this slice** — job + schema + WarEra parse helpers + DB-first resolve helper + migrate existing `getUserById` call sites that only need identity/MU/company.

## Decisions

| Topic | Choice |
| --- | --- |
| Job | Dedicated **`mu-member-poll`** (not folded into `mu-stats-poll`) |
| Data tier | **Geo-adjacent** — roster driven by watched MUs (`mu_watch_reasons` → `mu_members`) |
| Who is polled | Distinct `user_id` from `mu_members` for watched MUs only (not followed-but-off-roster players) |
| Upstream | **`user.getUserById` only** (batched). Do not call `user.getUserLite` in this job |
| Current vs history | **Snapshots only** — no dual-write “current” profile table in v1 |
| “Latest” access | App helper `getLatestUserProfile` / `resolveUserByIdRef` (`ORDER BY recorded_at DESC LIMIT 1`); SQL view deferred |
| Column style | **Fat typed tier A** — no JSON `payload` for leftovers in v1; drop unknown fields until promoted |
| Cadence | Every **5 minutes** (`0 */5 * * * *`) |
| Retention | Keep forever for now (no prune in v1) |
| Batching | Existing `requestBatch`; max **50** procedures per HTTP batch |
| Demand fallback | On miss/stale: live `getUserById` **does not** append a snapshot (poll is the sole writer) |
| Derived activity | **Read-time** experiments only in later UI — v1 stores raw timestamps / flags |
| UI / routes | Out of scope |

## Architecture

```
[mu-member-poll] every 5m
  → watched MU ids (mu_watch_reasons)
  → distinct user ids from mu_members
  → batch user.getUserById (≤50 / request)
  → insert user_profile_polls + user_profile_snapshots (append-only)

[Consumers]
  → getLatestUserProfile(db, userId)
  → resolveUserByIdRef({ db, warera, userId, maxAgeMs? })
       latest snapshot if present (and fresh)
       else live fetchUserById (no snapshot write)
  → syncFollowedPlayers / follow add / job-wage: DB first, API fallback
```

## Data model

### `user_profile_polls`

One row per job run.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer PK | Auto-increment |
| `recorded_at` | timestamp | Poll clock |
| `status` | text | `success` \| `partial` \| `error` |
| `error` | text? | Summary when not fully successful |
| `user_count` | integer | Snapshot rows written |
| `mu_count` | integer | Watched MUs whose rosters contributed member ids |

Index: `(status, recorded_at)` (same spirit as other poll tables).

### `user_profile_snapshots`

One row per user per successful poll slot. Append-only.

| Group | Columns | Source (approx.) |
| --- | --- | --- |
| Keys | `poll_id`, `user_id`, `recorded_at` | poll + `_id` / request id |
| Identity | `username`, `avatar_url`, `country_id`, `mu_id`, `company_id`, `party_id` | top-level / nested ids |
| Flags | `is_active` | `isActive` |
| Dates | `last_connection_at`, `last_work_at`, `last_help_asked_at`, `last_daily_reward_claimed_at`, `last_company_joined_at`, `last_daily_calendar_claimed_at`, `last_skills_reset_at` | `dates.*` — omit noisy UI-check dates (notifications / events / messages / announcements) |
| Leveling | `level`, `total_xp`, `daily_xp_left`, `available_skill_points`, `spent_skill_points`, `total_skill_points`, `prestige_level` | `leveling.*` |
| Other | `military_rank`, `is_premium`, `premium_months_count` | `militaryRank`, `infos.isPremium`, `infos.premiumMonthsCount` |
| Account | `created_at_game` | API `createdAt` |

Indexes:

- `(user_id, recorded_at DESC)` — latest + history windows  
- `(poll_id)`  
- `(mu_id, recorded_at)` — MU-scoped activity charts later  

No JSON `payload` column in v1.

### Out of schema (v1) — promote later if needed

Rankings (`weeklyUserDamages`, `userBounty`, …), `stats` wealth/cases/streaks, missions counters, equipment, skills, prefs, tours, `emailVerified`.

## Job: `mu-member-poll`

| Field | Value |
| --- | --- |
| Id | `mu-member-poll` |
| Default cron | `0 */5 * * * *` |
| Default enabled | `true` |

### Run steps

1. Load watched MU ids (same watchlist source as `mu-stats-poll` / battle jobs: distinct ids from `mu_watch_reasons`).
2. Load distinct `user_id` from `mu_members` for those MUs. If empty → insert poll with `success`, `user_count = 0`, no WarEra calls.
3. Batch `user.getUserById` via `warera.requestBatch` (dedupe ids; chunk ≤50).
4. Parse each ok slot into the typed tier-A shape (extend `src/warera/users.ts` beyond today’s thin `UserByIdRef`).
5. Insert `user_profile_polls` then snapshot rows for successful parses.
6. Status:
   - `success` — every requested id produced a snapshot  
   - `partial` — at least one snapshot, some failures  
   - `error` — no snapshots  
7. Log structured fields: `poll_id`, `user_count`, `mu_count`, `status` (and errors summary when not success).

### Partial failure

- Failed / unparseable batch slots → no row for that user this poll; prior history unchanged.
- Continue the run; do not abort the whole poll on a single user failure.

## WarEra client

- Extend parse/fetch in `src/warera/users.ts` (or a focused sibling module) for full tier-A `getUserById` fields.
- Keep using `createWareraClient` / rate limit / tRPC HTTP batch — no parallel HTTP stack.
- `user.getUserById` is on the official OpenAPI allowlist.

## DB-first resolve helper

```ts
getLatestUserProfile(db, userId) → snapshot | null

resolveUserByIdRef({ db, warera, userId, maxAgeMs? })
  → if latest snapshot exists and (maxAgeMs unset or age ≤ maxAgeMs):
       map to { userId, username, muId, companyId }
  → else:
       live fetchUserById(warera, userId)  // no snapshot insert
```

**Default `maxAgeMs` for background jobs:** **10 minutes** (two poll intervals), so a stuck poll does not silently feed stale MU membership into follow reconcile.

### Migrate in this slice

| Caller | Change |
| --- | --- |
| `syncFollowedPlayers` | Resolve each followed id via helper; on snapshot hit skip WarEra for that id; still upsert `players` + reconcile `follow_player` MU reasons from the resolved ref |
| Follow add (`follow.ts` live `fetchUserById`) | Same helper |
| `job-wage` (and similar one-off identity lookups) | Same helper |

### Leave for later

- `GET /api/user` / `buildUser` (needs skills / richer pack beyond tier A)
- Advisor / companies `user.getUserLite` enrichment
- SQL `user_profiles_latest` view
- Dual-write to `players` from the poll itself

## Out of scope

- Web UI, charts, Discord shoutouts
- Derived activity-score columns
- Typed rankings / wealth / equipment / skills
- Snapshot pruning
- Polling users who are followed but not on a watched MU roster (they remain demand / sync API path until they appear on a watched roster)

## Testing

- Parser fixtures shaped like live `getUserById` (tier A; null-safe dates / leveling / premium).
- Job `run` with mocked batch: watched MU + roster → poll + N snapshots; `partial` when one slot fails; empty roster → success / zero users.
- `getLatestUserProfile` / `resolveUserByIdRef`: latest wins; miss → API; stale beyond `maxAgeMs` → API; fallback does not insert.
- `syncFollowedPlayers` tests: snapshot hit skips WarEra for that id; miss still batches API.

## Inventory

When implementing, update `docs/warera-api/inventory.md`:

- Resource: MU member profile / activity snapshots  
- Refresher: `mu-member-poll`  
- Cadence: every 5 minutes  
- Upstream: `user.getUserById` (batch)  
- Storage: append-only (`user_profile_polls` / `user_profile_snapshots`)  
- Consumers: follow sync (DB-first), future MU activity / encouragement tools  

## Success criteria

1. Job registered, default cron every 5 minutes, visible in the Jobs UI.  
2. Each successful run appends one poll and one typed snapshot per distinct roster member.  
3. `resolveUserByIdRef` used by `syncFollowedPlayers` and the other listed call sites with DB-first behavior.  
4. No new public API routes or MU UI required to start collecting.  
