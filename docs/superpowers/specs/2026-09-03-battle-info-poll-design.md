# Battle Info Poll — Design

**Date:** 2026-09-03  
**Status:** Approved for implementation  
**Depends on / extends:**

- [Data Tier Caching Strategy](./2026-08-02-data-tier-caching-strategy-design.md) (jobs own Global/Geo; watchlists)
- [MU Stats Poll](./2026-08-03-mu-stats-poll-design.md) (poll + current row + append-only snapshots pattern)
- [Warera Toolkit Foundation](./2026-07-31-warera-toolkit-foundation-design.md) (Croner jobs, Turso)

## Goal

Background-gather **battle scoreboard** and **per-member battle loot/contribution** for battles where our watched MUs have (or had) orders — so we can later build weekly/monthly stats and achievements (damage, bounty money, contract money, hits, cases) without deep battle analytics.

**No UI or public API routes in this slice** — job + schema + WarEra client only.

## Decisions

| Topic | Choice |
| --- | --- |
| Data tier | **Global-ish battle catalog** filtered by **Geo MU watchlist** (`mu_watch_reasons`) |
| Watched MUs | Same set as MU stats: distinct ids from `mu_watch_reasons` (+ roster from `mu_members`) |
| Relevance | Battle is tracked when a watched MU appears in `attacker.muOrders` or `defender.muOrders` |
| Sticky tracking | Once relevant, keep tracking until finalized even if the MU order is later removed |
| Cadence | Every **15 minutes** (tunable later) |
| Active discovery | `battle.getBattles({ isActive: true })` — **full cursor pagination** required |
| Live scoreboard source | Embedded `currentRound` on getBattles items (damages, points, `live.nextTickAt`, round id/number/`createdAt`) — **not** `getLiveBattleData` |
| End detection | DB `is_active` battles absent from the **complete** active getBattles set |
| End metadata | **`battle.getById` only for ended battles** (final `roundsHistory`, winners, etc.) |
| Settle grace | After first observe-as-ended, set `ended_at`; finalize (final getById + loot) only when `now - ended_at ≥ 1 minute` |
| Loot | `battleLootSummary.getByBattleAndUser` — append-only snapshots; skip when API returns not-found |
| Battle history | **Current upsert** + **light scoreboard snapshots** each poll (not deep analytics) |
| Retention | Keep forever for now |
| UI / routes | Out of scope |

## Architecture

```
[battle-info-poll] every 15m
  → list watched MU ids (mu_watch_reasons) + their mu_members
  → paginate battle.getBattles({ isActive: true }) to completion
  → filter / sticky-mark battles whose muOrders intersect watched MUs
  → upsert battles (current) + append battle_scoreboard_snapshots
  → compare: DB is_active − API actives → candidates ended
       if ended_at unset → set ended_at
       if now - ended_at < 1m → still settling (loot as normal, do not finalize)
       if ≥ 1m → battle.getById (final) + final loot pass → mark finalized / is_active=false
  → for workset battles: loot summaries for sticky MU members (batched)
  → insert battle_polls + snapshot rows

[Future UI / APIs]
  → read battles for “now”
  → read scoreboard + loot snapshots for charts / achievements
```

### Request discipline

| Call | When |
| --- | --- |
| `battle.getBattles` (all pages) | Every run |
| `battle.getById` | Only battles past settle grace (ended, about to finalize) |
| `battleLootSummary.getByBattleAndUser` | Workset battles × sticky MU roster members (deduped by user) |
| `battle.getLiveBattleData` | **Not used** in v1 |

**Partial active walk must not imply endings.** If getBattles pagination fails mid-cursor, do not treat missing DB battles as ended (would false-finalize). Mark poll `error`/`partial` and skip end-detection for that run (or only end-detect when the active set is known-complete).

## Data model

### Classification

| Kind | Storage |
| --- | --- |
| Battle identity, sides, orders, sticky MUs, active/ended/finalized | `battles` (current) |
| Mid-fight scoreboard samples | `battle_scoreboard_snapshots` |
| Per-member contribution counters at poll time | `battle_loot_snapshots` |
| Poll clock / status | `battle_polls` |

### `battles`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | WarEra battle id |
| `war_id` | text? | |
| `type` | text? | e.g. `war` |
| `is_active` | integer/bool | our flag; false only after finalize |
| `attacker_country_id` | text? | |
| `defender_country_id` | text? | |
| `attacker_region_id` | text? | |
| `defender_region_id` | text? | |
| `rounds_to_win` | integer? | |
| `current_round_id` | text? | from `currentRound._id` while active |
| `current_round_number` | integer? | |
| `attacker_won_rounds` | integer? | |
| `defender_won_rounds` | integer? | |
| `attacker_mu_orders` | json? | string[] latest seen |
| `defender_mu_orders` | json? | string[] latest seen |
| `sticky_mu_ids` | json? | string[] watched MUs that triggered tracking |
| `rounds_history` | json? | filled/refreshed especially on final `getById` |
| `started_at_game` | timestamp? | API `createdAt` |
| `ended_at` | timestamp? | first time we observed absent from active list |
| `finalized_at` | timestamp? | final getById + loot completed |
| `fetched_at` | timestamp? | last successful battle refresh |
| `payload` | json? | leftovers |

### `battle_polls`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer PK | |
| `recorded_at` | timestamp | |
| `status` | text | `success` \| `partial` \| `error` |
| `error` | text? | |
| `active_battle_pages` | integer? | pages fetched (debug) |
| `battle_count` | integer | battles upserted / snapshotted this run |
| `loot_snapshot_count` | integer | loot rows written |
| `finalized_count` | integer | battles finalized this run |

### `battle_scoreboard_snapshots`

One row per tracked battle per poll (while in workset).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer PK | |
| `poll_id` | integer | FK → `battle_polls` |
| `battle_id` | text | |
| `round_id` | text? | `currentRound._id` |
| `round_number` | integer? | |
| `round_is_active` | integer/bool? | |
| `attacker_points` | integer/real? | `currentRound.attacker.points` |
| `defender_points` | integer/real? | |
| `attacker_damages` | real? | **from `currentRound`**, not side-level battle.damages |
| `defender_damages` | real? | |
| `attacker_hit_count` | integer? | battle side `hitCount` (optional but useful) |
| `defender_hit_count` | integer? | |
| `ticks_count` | integer? | `currentRound.live.ticksCount` |
| `next_tick_at` | timestamp? | `currentRound.live.nextTickAt` |
| `round_started_at_game` | timestamp? | `currentRound.createdAt` |
| `recorded_at` | timestamp | |

Index: `(battle_id, poll_id)`, `(battle_id, recorded_at)`.

Do **not** persist `lastHits` arrays in v1 (noisy; other tools cover hit feeds).

### `battle_loot_snapshots`

One row per (battle, user) per poll when a summary exists.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer PK | |
| `poll_id` | integer | |
| `battle_id` | text | |
| `user_id` | text | |
| `mu_id` | text | watched MU whose roster caused the fetch (if user in multiple, pick one deterministically or store first sticky) |
| `total_dmg` | real? | |
| `hits` | integer? | |
| `total_money_from_bounty` | real? | |
| `total_money_from_contract` | real? | |
| `case1_count` | integer? | |
| `case2_count` | integer? | |
| `pool_loot` | json? | as returned |
| `payload` | json? | |
| `recorded_at` | timestamp | |

Index: `(battle_id, user_id, poll_id)`, `(mu_id, recorded_at)`.

**Not-found:** API message like `Battlelootsummaries not found` → **skip** (no row). Do not treat as poll failure.

## Job: `battle-info-poll`

| Field | Value |
| --- | --- |
| Id | `battle-info-poll` |
| Default cron | `0 */15 * * * *` (every 15 minutes) |
| Default enabled | `true` |

### Run steps

1. Load watched MU ids from `mu_watch_reasons`; load `mu_members` for those MUs.
2. Paginate `battle.getBattles({ isActive: true })` until no `nextCursor`. Build `activeById` map. If pagination incomplete → abort end-detection; status ≥ `partial`/`error`.
3. **Enqueue / sticky:** for each active battle whose `muOrders` intersect watched MUs, ensure `battles` row; union into `sticky_mu_ids`; set `is_active = true`.
4. **Workset (active):** sticky DB battles that still appear in `activeById` → upsert current fields from getBattles item; buffer scoreboard snapshot from `currentRound`.
5. **Ended candidates:** sticky/`is_active` DB battles **not** in `activeById`:
   - If `ended_at` is null → set `ended_at = now`.
   - If `now - ended_at < 1m` → include in loot workset as settling; **do not** finalize.
   - If `now - ended_at ≥ 1m` and not yet `finalized_at` → `battle.getById`; upsert final fields (`rounds_history`, won rounds, etc.); include in **final** loot pass; set `is_active = false`, `finalized_at = now`.
6. **Loot:** for each workset battle (active sticky + settling + finalizing), for each member of that battle’s `sticky_mu_ids` (dedupe users), call `battleLootSummary.getByBattleAndUser`; append snapshots on success.
7. Insert `battle_polls` + buffered snapshots; log `{ poll_id, battle_count, loot_snapshot_count, finalized_count, status }`.

### Partial failure

- getBattles page fails → no false endings; poll error/partial.
- getById fails on finalize → leave `is_active` true / `finalized_at` null; retry next run (still past grace).
- Individual loot failures → continue; poll ≥ `partial`.

## WarEra client

- New helpers under `src/warera/` (e.g. `battles.ts`):
  - Parse getBattles item (sides, `muOrders`, embedded `currentRound` + `live`)
  - `fetchAllActiveBattles` (cursor drain)
  - `fetchBattleById`
  - Parse + `fetchBattleLootSummary(battleId, userId)` (treat not-found as `null`)
- Use `createWareraClient` / rate limit / tRPC batch for loot fan-out.
- Both `battle.*` and `battleLootSummary.getByBattleAndUser` are on official OpenAPI.

## Out of scope

- Web UI, charts, Hono read routes
- `battle.getLiveBattleData`, `battleRanking.getRanking`, `round.getLastHits`
- Tracking battles with no watched-MU order (off-order fights)
- Donations / user wealth jobs (separate from this slice)
- Snapshot pruning
- Discord notifications

## Testing

- Parser fixtures from live-shaped getBattles (`currentRound` object) and loot summary / not-found
- Cursor pagination drains multiple pages
- Sticky: order removed but battle still tracked until finalize
- End detection only when active set complete
- Settle grace: no finalize before 1m; finalize path calls getById once
- Loot not-found does not fail the poll
- Job unit test with mocked WarEra + in-memory/schema bootstrap (same style as `mu-stats-poll`)

## Inventory

When implementing, update `docs/warera-api/inventory.md` for the new job, tables, cadence, and procedures.
