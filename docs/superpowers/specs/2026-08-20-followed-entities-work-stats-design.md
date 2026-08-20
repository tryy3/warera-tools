# Followed Entities + Work Stats — Design

**Date:** 2026-08-20  
**Status:** Approved for implementation  
**Depends on / extends:**

- [Data Tier Caching Strategy](./2026-08-02-data-tier-caching-strategy-design.md) (amend: bounded followed-user watchlist may be job-refreshed)
- [MU Stats Poll](./2026-08-03-mu-stats-poll-design.md) (watchlist becomes reason rows, not `mus` row presence)
- [Warera Toolkit Foundation](./2026-07-31-warera-toolkit-foundation-design.md) (Croner jobs, Turso, Jobs UI)

## Goal

Lay a **follow list** for WarEra players (and independent reasons to watch MUs) so background jobs can collect user-derived data over time. First consumer: **daily work stats** (employer view + employee view). MU stats polling switches to the same reason model. **No work-stat charts** in this slice — operator lists to add/remove follows only.

Search-by-name is **only** for the add form (resolve name → ID). After an ID is stored, collection always uses that ID (`user.getUserById`, `mu.getById`, work-stat procedures). Jobs never call `search.*`.

## Decisions

| Topic | Choice |
| --- | --- |
| Follow model | Parallel reason tables (`player_watch_reasons`, `mu_watch_reasons`), same columns; collection = `DISTINCT` subject id |
| v1 live reasons | Players: `manual`. MUs: `manual` + `follow_player` (one row per followed player in that MU) |
| Future reasons | `reason` is text, not a DB enum. Schema includes `last_touched_at` for later `search` TTL / activity; no expiry job in v1 |
| Companies | No company-reasons table. Work targets are **derived** each job run from followed players |
| Work data | Company daily totals **and every current employee** on factories **owned** by followed players, plus each followed player’s **own** worker series at their workplace (even if they don’t own it) |
| Work storage | Upsert one row per `(company, date)` and `(company, worker, date)`. Not append-only intra-day |
| Cadence | Work job **hourly** (offset from price/MU, e.g. `:10`). MU poll stays **every 30 minutes** |
| `days` param | Request `14`; persist whatever days the API returns (~5 observed) |
| Search vs collect | Search on add UI only; jobs and post-add fetches use stored IDs |
| Work/MU procedures | `work.getStatsByCompany` / `work.getStatsByWorkerAndCompany` are **not** on official OpenAPI — documented api2 override + `X-API-Key`, same class as `muMember.getByMu` |
| Batching | Resolve all ids first, then tRPC batch (existing `requestBatch` + URL chunking). Prefer GET; if these procedures require POST, extend the batch helper rather than N sequential calls |
| Seed MU | Migrate backfills `manual` reasons for every existing `mus.id`; if none, seed `69e5dc36f7b095e977052f7b`. Stop “insert if `mus` empty” |
| `mus` table | Current entity + roster only. **Row presence is no longer the watchlist** |
| Operator UI | Follow pages: Players + MUs. ID paste or search-by-name fills ID, then Add writes `manual` |
| Charts / registration / search TTL | Out of scope |

## Architecture

```
Operator Follow UI
  search.searchAnything (add picker only)
  → insert player_watch_reasons / mu_watch_reasons (manual)
  → user.getUserById / mu.getById by stored id
  → upsert players / mus current
  → reconcile MU follow_player for that player

[syncFollowedPlayers]  (jobs + UI add/remove)
  DISTINCT player_id from player_watch_reasons
  → batch user.getUserById
  → upsert players
  → reconcile mu_watch_reasons reason=follow_player per source player

[work-stats-poll] hourly
  → syncFollowedPlayers
  → company.getCompanies per followed player (owned)
  → worker.getWorkers per owned company
  → add workplace (companyId, followedPlayerId) if missing
  → batch work.getStatsByCompany + work.getStatsByWorkerAndCompany
  → upsert company_work_stats / worker_work_stats by daily_date

[mu-stats-poll] every 30m
  → syncFollowedPlayers
  → DISTINCT mu_id from mu_watch_reasons
  → existing mu.getById + muMember.getByMu snapshot loop
```

```
player_watch_reasons          mu_watch_reasons
  (manual, …)                   (manual, follow_player, …)
        │                              │
        ▼                              ▼
   DISTINCT player_id            DISTINCT mu_id
        │                              │
        ├─ work-stats-poll             └─ mu-stats-poll
        └─ follow_player ──────────────┘
```

## Data tier

Interactive **selected player** (shell Load/Refresh) stays demand-driven User-tier.

**Followed players** are a **bounded watchlist that jobs may refresh**. That is an explicit exception to “no per-user cron”: it applies only to ids in `player_watch_reasons`, not to whoever is selected in the shell.

| Resource | Tier | Who refreshes | Storage |
| --- | --- | --- | --- |
| Followed players (reasons + current `players`) | User watchlist | Jobs + operator CRUD | Latest + reason rows |
| Work daily stats | Job-owned history derived from that watchlist | `work-stats-poll` | Upsert by day |
| MU identity / snapshots | Geo | `mu-stats-poll` over distinct reason ids | Latest + append snapshots (unchanged) |

Update [inventory.md](../../warera-api/inventory.md) in the same work. Do not update `vision.md`.

## Data model

### Reason tables (same shape)

`player_watch_reasons` and `mu_watch_reasons`:

| Column | Type | Notes |
| --- | --- | --- |
| `player_id` / `mu_id` | text | WarEra id |
| `reason` | text | v1 players: `manual`. v1 MUs: `manual` \| `follow_player`. Later: `search`, `mu_roster`, government, groups, … |
| `source_id` | text not null | `''` for manual. For `follow_player`, the followed **player** id |
| `last_touched_at` | timestamp | Set on insert (and later on search/activity touch) |
| `created_at` | timestamp | |

Primary key: `(subject_id, reason, source_id)`.

Two followed players in the same MU → two `follow_player` rows. One leaves → delete that row only. A `manual` row on the same MU is untouched.

Collection queries:

```sql
SELECT DISTINCT player_id FROM player_watch_reasons;
SELECT DISTINCT mu_id FROM mu_watch_reasons;
```

### `players` (current identity)

Mirror `mus` “current entity” (not a watchlist):

| Column | Notes |
| --- | --- |
| `id` | WarEra user id PK |
| `username` | |
| `mu_id` | Current MU from `user.getUserById` (null if none) |
| `workplace_company_id` | Company they work at (existing `company` parse) |
| `payload` | Unknown leftovers JSON |
| `fetched_at` | Last successful id lookup |

Row may remain after unfollow (like unwatched `mus`). Watch membership is reasons-only.

### `mus`

Unchanged columns. **Stop treating row presence as the poll list.** `listMusForSync` reads distinct ids from `mu_watch_reasons`. `ensureSeedMu` goes away.

Migrate:

1. Insert `manual` reasons for **every existing `mus.id`** so today’s watchlist is not dropped.
2. If `mus` is empty, insert seed MU `69e5dc36f7b095e977052f7b` as a `manual` reason (entity row is created on the next successful poll, same as today).

Empty reasons → MU job no-op success; historical snapshots stay.

### Work history (upsert by day)

`company_work_stats` — PK `(company_id, daily_date)`:

| Column | Source field |
| --- | --- |
| `automated_engine` | `automatedEngine` |
| `employee_prod` | `employeeProd` |
| `self_work` | `selfWork` |
| `total` | `total` |
| `wage` | `wage` |
| `fetched_at` | Job clock |
| `payload` | Unknown leftovers |

`worker_work_stats` — PK `(company_id, worker_id, daily_date)`:

| Column | Source field |
| --- | --- |
| `employee_prod` | `employeeProd` |
| `total` | `total` |
| `wage` | `wage` |
| `fetched_at` | Job clock |
| `payload` | Unknown leftovers |

`daily_date` is the API `dailyDate` string (`YYYY-MM-DD`). Past days = that day’s total; today = so far. Re-polling the same day overwrites. No `work_polls` table; `job_runs` records run status.

No current-company table in v1.

## Jobs

### `syncFollowedPlayers`

Shared helper used by both jobs and by Follow UI after add/remove player.

1. List distinct followed player ids.
2. Batch `user.getUserById` (stored ids only).
3. Upsert `players`.
4. For each player, reconcile `mu_watch_reasons` where `reason = 'follow_player'` and `source_id = playerId`:
   - Has MU: upsert that `(mu_id, follow_player, playerId)`; delete other follow_player rows for this source.
   - No MU: delete this source’s follow_player rows.
5. Never delete `manual` (or future non-follow) MU reasons.

Parse MU from `user.getUserById` the same way we parse `company` (string id or nested `_id`). If the live payload uses another key, extend the parser; do not search by username.

### `work-stats-poll`

| Field | Value |
| --- | --- |
| Id | `work-stats-poll` |
| Default cron | `0 10 * * * *` (hourly at minute 10; energy refill is hourly) |
| Default enabled | `true` |

Run steps:

1. `syncFollowedPlayers`.
2. Discover **owned** companies: `company.getCompanies` per followed player (existing helper; batch if practical).
3. For each owned company: `worker.getWorkers` → worker targets `(companyId, workerUserId)`.
4. For each followed player with `workplace_company_id`: add `(workplace, playerId)` if not already in the target set (employee view at a factory they don’t own — **not** that factory’s full roster).
5. Dedup company ids and `(companyId, workerId)` pairs.
6. Batch `work.getStatsByCompany` `{ companyId, days: 14 }` and `work.getStatsByWorkerAndCompany` `{ companyId, workerId, days: 14 }`.
7. Upsert parsed daily rows. Continue on per-target errors.
8. Job message / logs: `{ player_count, company_count, worker_count, company_days, worker_days, status, errors }` (flat primitives). Status `success` \| `partial` \| `error` like MU.

Force `baseUrl: https://api2.warera.io/trpc` and `authStyle: "api-key"`. Missing `WARERA_API_KEY` → fail the run with a clear error.

If GET batch 404s/rejects, use POST JSON (as in the in-game explorer) via an extended batch/request helper — still chunked, still one round trip per chunk.

### `mu-stats-poll` (change)

1. Call `syncFollowedPlayers` first.
2. Poll distinct `mu_id` from `mu_watch_reasons` (not `SELECT id FROM mus`).
3. Drop empty-watchlist seed insert. Snapshot loop otherwise unchanged.

## WarEra client

New helpers under `src/warera/` (e.g. `work-stats.ts`): parse + fetch the two work procedures.

Extend `user.getUserById` parse to return `{ companyId, muId, username }` (today only `companyId`).

Extend search used by the add form:

- Players: existing `searchUsers` / `GET /api/economy/search` (`search.searchAnything` → user ids + lite names).
- MUs: parse `muIds` from `search.searchAnything`, or `search.searchMus` if needed (document override). Return `{ muId, name }`.

Update the warera-api skill allowlist notes for `work.getStatsByCompany` and `work.getStatsByWorkerAndCompany`.

## Operator UI

Countries-style Follow area (nav next to Countries/Jobs):

- **Players** list: username, id, current MU, workplace, reasons (v1: `manual`). Remove last player reason → also delete that player’s `follow_player` MU rows.
- **MUs** list: name, id, reasons. `manual` removable. `follow_player` read-only (show source player username); jobs/UI sync own those rows.

**Add form** (both lists): required ID field + search-by-name that **fills the ID** when a hit is clicked (API explorer pattern). Then Add:

1. Insert `manual` reason (idempotent PK).
2. Fetch entity **by that ID** (`user.getUserById` / `mu.getById`) — no second search.
3. Upsert `players` / `mus`. For a new player, run follow_player reconcile.

Reuse `GET /api/economy/search?q=&type=user|mu` (`type` defaults to `user` so Companies player search stays unchanged). Combobox patterns from `CompaniesPlayerSearch` may be reused; the ID field must remain pasteable without searching.

Reject add if getById 404s. Search failure does not insert a reason. Adding a player/MU does **not** run work-stat ingest; that waits for `work-stats-poll`. It does run `syncFollowedPlayers` / `mu.getById` so reasons and current rows are correct immediately.

Hono CRUD under e.g. `/api/follow/players` and `/api/follow/mus` (list, add manual, remove manual). No public work-stat read routes in v1.

## Error handling

| Case | Behavior |
| --- | --- |
| Search failing | UI error; no insert |
| Paste ID that 404s | Reject add |
| Duplicate manual | Idempotent |
| One company/worker/MU/player fails in a job | Continue; `partial` |
| Empty player or MU reasons | No-op success |
| Missing API key for work stats | Fail run, clear error |
| Worker leaves a factory | Dropped from next roster; old daily rows stay |
| Player leaves MU | That `follow_player` row deleted; MU stays if another reason exists |
| Rate limits | Existing client limiter; batch + chunk |

Retention: keep work daily rows and MU snapshots forever in v1 (no prune).

## Testing

- Reason helpers: independent add/remove; distinct ids; two players same MU; player move MU deletes only that source’s row; manual survives.
- `syncFollowedPlayers` with mocked `user.getUserById`.
- Work-stat parsers from fixtures matching the live payloads in this spec’s source request.
- `work-stats-poll`: mocked batch; upsert same `(company, date)` twice overwrites; workplace-only worker not expanded to full foreign roster; owned company includes all `worker.getWorkers` ids.
- MU poll: empty `mus` but a reason row still polls; seed is a manual reason; `follow_player` drives the list.
- Routes: add/remove/search; add does not call `search.*` after an ID is supplied.
- No chart tests.

## Out of scope

- Work-stat or MU charts / public read APIs for the new daily tables
- `search` watch reason TTL / “last searched on a stats page”
- Company-reasons table / following a factory without following its owner
- Intra-day append-only work samples
- Player self-registration / activity eviction
- Following groups, government, or “everyone in this MU” (schema allows later `reason` values)
- Changing MU snapshot schema or 30-minute cadence
- Discord notifications

## Success criteria

1. Operator can add/remove followed players and manual MUs by ID, with optional name search that only fills the ID.
2. Hourly work job upserts company + per-worker daily rows for owned factories, and the followed player’s own workplace series.
3. MU poll watches distinct reason ids; seed MU is `manual`; leaving an MU drops only that player’s `follow_player` row.
4. Jobs never call `search.*`.
5. Inventory + warera-api skill notes updated for the new procedures and the followed-user watchlist.
