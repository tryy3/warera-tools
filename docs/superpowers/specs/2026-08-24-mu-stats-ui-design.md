# MU Stats UI — Design

**Date:** 2026-08-24  
**Status:** Approved for implementation  
**Depends on / extends:**

- [MU Stats Poll](./2026-08-03-mu-stats-poll-design.md) (snapshots + current `mus` / `mu_members`)
- [Market Price Charts](./2026-08-01-market-price-charts-design.md) (search → detail + TanStack Charts + range query pattern)
- [Followed Entities / work stats](./2026-08-20-followed-entities-work-stats-design.md) (watch reasons, MU enqueue)

## Goal

Add an **MU** tool page to search any Military Unit, show current identity/stats, and chart historical MU + per-member counters already collected by `mu-stats-poll`. Prefer existing DB data; use light WarEra reads only for cold/stale current fill and search.

## Decisions

| Topic | Choice |
| --- | --- |
| Entry | Search any MU → detail; cold open live-fills current + enqueues watch |
| Live fill | `mu.getById` + `muMember.getByMu`; upsert current tables only |
| First snapshot on cold open | **No** — history starts after next successful `mu-stats-poll` |
| Watch enqueue | `insertMuWatchReason` with `manual` after successful `mu.getById` |
| Metrics | All snapshotted MU + member scalar fields via metric pickers |
| Detail layout | **Stacked**: header → current strip → MU chart → members chart + roster |
| Member series | All members (≤25) as series; legend toggles visibility |
| Member labels | Best-effort username from local `players`; else truncated user id |
| Chart stack | TanStack Charts (same as Market / Equipment) |
| History ranges | Rolling `24h` \| `7d` \| `30d` \| `all` **plus** calendar `this_week` \| `last_week` |
| Week bounds | Monday 00:00 **UTC** (aligned with WarEra weekly reset); this week = Mon→now; last week = previous Mon→Sun |
| Custom date picker | Out of scope for v1 |
| New WarEra procedures | None beyond existing search + `mu.getById` + `muMember.getByMu` |
| Tabbed charts | Out of scope for v1 (escape hatch later if stacked feels noisy) |

## Architecture

```
[/mu search]  --> GET /api/economy/search?type=mu  (existing)

[/mu/$muId]   --> GET /api/mu/:id
                  warm: mus + mu_members + latest counters + player usernames
                  cold: mu.getById + muMember.getByMu
                        → upsert current → manual watch reason
                        → NO mu_polls / snapshots

              --> GET /api/mu/:id/history?range=&scope=mu|members&metric=
                  DB-only join snapshots ↔ mu_polls.recorded_at

[mu-stats-poll] (unchanged, ~30m) --> append snapshots → charts fill in
```

## Routes & navigation

| Label | Path | Purpose |
| --- | --- | --- |
| MU | `/mu` | Search landing |
| MU detail | `/mu/$muId?range=7d&muMetric=…&memberMetric=…` | Current + charts |

- Add **MU** to the shell nav (near Follow / Market).
- Invalid/missing `range` → `7d`.
- Default metrics: MU `weeklyDamages`; members `weeklyDamagesCount` (schema column names).
- Range (and optionally metrics) mirrored in the URL like Market’s `?range=`.

## UI

### Search (`/mu`)

- Reuse economy MU search UX (same pattern as Follow’s MU search field).
- Results navigate to `/mu/$muId`.
- Optional badge when the id is already watched and/or has snapshot history (local DB only).

### Detail (`/mu/$muId`) — stacked

1. **Header** — avatar, name, country, level, member count, watched / last-fetched hint.
2. **Current strip** — default chips from newest MU snapshot when present: `weeklyDamages` (+ rank if available), `bounty`, `reputation`, `wealth`; otherwise show level / mercenary reputation from current `mus` row. All other numeric snapshot fields remain available via chart metric pickers.
3. **MU history chart** — metric select + range chips; single series. Range/metric are independent of the members chart.
4. **Members chart** — its own metric select + range chips; multi-series (all roster members present in the window); legend toggles.
5. **Roster table** under members — role, label (username\|id), latest value for selected member metric; sortable.

**Empty history:** charts show an explicit empty state (“history appears after the next MU stats poll”), not a fake zero series. Current header/strip still render.

**Range chips (both charts):**

| Chip | Meaning |
| --- | --- |
| 24h | Rolling last 24 hours |
| 7d | Rolling last 7 days (default) |
| 30d | Rolling last 30 days |
| all | Full retained history |
| This week | Monday 00:00 UTC → now |
| Last week | Previous Monday 00:00 UTC → that Sunday 24:00 UTC |

## API

### `GET /api/mu/:id`

Current view only. May live-fill.

**Response (shape sketch):**

- `mu` — id, name, avatarUrl, countryId, regionId, level, mercenaryReputation, roles/upgrades summary, fetchedAt
- `members[]` — userId, role, username (nullable), latest counters (nullable if no snapshots yet)
- `latestMuStats` — nullable object of MU snapshot scalars + ranks/tiers
- `meta` — `watched`, `historyAvailable`, `liveFilled` (bool)

**Cold / miss behavior:**

1. Call `mu.getById`; on failure → 404/502 as appropriate; **do not** enqueue.
2. Upsert `mus` (+ roster from getById).
3. Call `muMember.getByMu` for current member counters when possible; upsert `mu_members`. If member fetch fails after successful getById, still return MU identity and enqueue watch (partial current).
4. `insertMuWatchReason(manual)` so `mu-stats-poll` includes this MU.
5. Do **not** insert `mu_polls` or snapshot rows.

### `GET /api/mu/:id/history`

Query params:

| Param | Values |
| --- | --- |
| `range` | `24h` \| `7d` \| `30d` \| `all` \| `this_week` \| `last_week` |
| `scope` | `mu` \| `members` |
| `metric` | allowlisted column key for that scope |

DB-only. Server resolves `range` to absolute `[from, to]` in UTC. Returns points `{ recordedAt, value }[]` for MU scope, or `{ recordedAt, series: { userId, label, value }[] }[]` / equivalent flat series list for members.

Unknown metric → 400. No rows → empty points (200), not 404, when the MU exists.

### Existing (reuse)

- `GET /api/economy/search?type=mu&q=`

## Metrics allowlist

Chart `metric` query values are the Drizzle/schema field names below (not DB snake_case).

**MU (`mu_stat_snapshots`) — chartable values:**  
`weeklyDamages`, `bounty`, `reputation`, `damages`, `terrain`, `wealth`, `levelingLevel`, `levelingMonthlyDamages`.

Rank/tier companion columns (`*Rank`, `*Tier`) may show on the current strip / tooltips; v1 chart series use the numeric value columns only.

**Members (`mu_member_stat_snapshots`) — chartable values:**  
`totalDamagesCount`, `monthlyDamagesCount`, `weeklyDamagesCount`, `totalHelpCount`, `monthlyHelpCount`, `weeklyHelpCount`.

## Edge cases

| Case | Behavior |
| --- | --- |
| Unknown MU id after live fetch | 404 |
| WarEra timeout on cold fill | 502; enqueue only if `mu.getById` succeeded |
| No polls yet | Current UI ok; charts empty-state |
| Partial member history across polls | Plot available points only |
| Username missing | Truncated user id |
| MU not in search index but known id | Direct `/mu/$muId` URL still works via getById path |

## Out of scope (v1)

- Writing a snapshot on cold open
- Resolving all member usernames via live `user.*` calls
- Tabbed chart layout / MU-vs-MU comparison
- Custom from–to date picker
- Managing watch reasons beyond auto-manual enqueue on open
- Changing `mu-stats-poll` cadence or schema

## Testing

- API: warm current (DB only, no WarEra); cold fill mocks getById/getByMu + asserts upsert + manual watch + **no** snapshot insert
- History: rolling windows + `this_week` / `last_week` UTC boundaries (fixed “now” in tests)
- Metric allowlist rejection
- UI: search → detail navigation; empty history message; range/metric query wiring (smoke-level)

## Success criteria

1. Nav has **MU**; `/mu` search opens `/mu/$muId`.
2. Cold MU shows current identity after light live fill and is on the watchlist for the next poll.
3. Charts render all allowlisted metrics over rolling and calendar-week ranges once snapshots exist.
4. Members chart shows up to 25 series with best-effort names.
5. No new WarEra procedures beyond search + existing MU/member getters.
