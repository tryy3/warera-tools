# WarEra data inventory (as-is)

**Last reviewed:** 2026-09-03  
**Status:** Living — update when cadence, ownership, or major consumers change  
**Tier rules:** [Data tier caching strategy](../superpowers/specs/2026-08-02-data-tier-caching-strategy-design.md)

High-level catalog of how we fetch, store, and use WarEra-related data today. Not a schema reference.

## Architecture snapshot

```
Browser (SPA)
  → Hono /api/*  (TanStack Query in memory for user packs / some shared reads)
  → Turso (SoT for Global / Geo / packs / history)
  → Croner jobs (bulk Global / Geo refresh)
  → createWareraClient (governor, batch, dedup)
  → api2.warera.io/trpc
```

**Client defaults today**

| Setting | Typical value |
| --- | --- |
| `WARERA_API_BASE_URL` | `https://api2.warera.io/trpc` |
| Soft limiter | `WARERA_MAX_REQUESTS_PER_MINUTE` (default 120) |
| Header-aware 429 pause | Implemented (`ratelimit-*` / `Retry-After`) |
| Client tRPC HTTP batch | `requestBatch` + background 400ms window; max 50 slots |
| In-flight dedup | Same procedure+input+auth+base |
| Browser shared cache | TanStack Query, memory-only (unchanged) |
| localStorage | Prefs only (unchanged) |

## Tier reminder

| Tier | Who refreshes | Freshness intent |
| --- | --- | --- |
| **Global** | Croner (+ rare manual poll) | Minutes–hours; shared |
| **Geo** | Jobs over watchlist; cold miss live-fill | Hours–day; event-driven enqueue planned, not built |
| **User** | Shell Load/Refresh → server TTL | Short (~10m); demand-driven |

## Resource catalog

### Global

| Resource | What | Who refreshes | Cadence (default) | Upstream today | Storage | Main consumers |
| --- | --- | --- | --- | --- | --- | --- |
| Market prices | Item + scraps prices, top-order aggregates | `price-poll`; manual Market refresh | Hourly (`0 0 * * * *`) | api2 | Append history (`price_polls` / `price_snapshots`) + latest reads | Market, Calculator, Companies, Growth, Opportunities |
| Recommended regions | Best region id per producible item | `recommended-regions-poll`; cold miss on advisor paths | Hourly (`0 0 * * * *`) | api2 POST + `X-API-Key` | Latest upsert (`recommended_regions`) | Advisor / company economy |
| Item-market transactions | Equipment / itemMarket sales stream | `item-market-tx-backfill` (once per process) then `item-market-tx-poll` | Poll every minute; backfill `maxRuns: 1` | api2 + `X-API-Key` | Append-only (`item_market_transactions`) + handoff cursor | Equipment Market (`/api/equipment`) |
| Battles (ordered) | Active/ended battles sticky when watched MU in `muOrders`; light scoreboard + per-member loot | `battle-info-poll` | Every 15 minutes | `battle.getBattles` (full cursor), `battle.getById` on finalize only, `battleLootSummary.getByBattleAndUser` | `battles` current + `battle_scoreboard_snapshots` / `battle_loot_snapshots` | Future MU achievements / battle contrib (no UI yet) |

Global battle catalog (`battle.getBattles` cursor drain); rows enter and stay sticky when a watched MU (Geo watchlist from `mu_watch_reasons`) appears in attacker/defender `muOrders`.

### Geo

| Resource | What | Who refreshes | Cadence (default) | Upstream today | Storage | Main consumers |
| --- | --- | --- | --- | --- | --- | --- |
| Countries | Country list + tax metadata | `country-sync` | Daily midnight | api2 | Latest rows (`countries`) | Calculator, Equipment prefs, economy UI |
| Regions | Region facts for watchlist ids | `region-sync`; advisor cold miss upserts + enqueues | Hourly at :05 | api2 | Latest rows (`regions`); row presence = watchlist | Advisor, Growth, recommended-region follow-ups |
| Military units (MU) | MU metadata + member roster/stats | `mu-stats-poll` over watchlist | Every 30 minutes | `mu.getById` via api2; **`muMember.getByMu` forced api2 + X-API-Key** | Latest roster + append stat snapshots | MU tool (`/mu`, `GET /api/mu/:id`, `GET /api/mu/:id/history`), Follow |

Event-driven Geo (`enqueueGeoRefresh` from battles/laws/etc.) is **documented as planned** in the data-tier design; not implemented. Quiet regions may stay unchanged for days; hot war regions change often — today’s sync does not differentiate.

The MU watchlist is the set of distinct ids in `mu_watch_reasons` (seeded by `migrate manual` reason and reconciled from `follow_player` player reasons), **not** `mus` row presence.

### User

| Resource | What | Who refreshes | Cadence | Upstream today | Storage | Main consumers |
| --- | --- | --- | --- | --- | --- | --- |
| Selected player | `userId` + username | Shell selection (no WarEra cron) | Session / explicit Load | Search/lite via api2 | Shell state; recent list in localStorage | All user tools |
| Followed players | Followed player ids + reasons; current `players` row (username, MU, workplace) | `sync-followed-players` (runs inside `mu-stats-poll` + `work-stats-poll`); Follow CRUD from shell | On poll; on add/remove | `user.getUserById` via api2 batch | `player_watch_reasons` (reasons) + `players` (current) | MU follow reconcile, work-stats poll, follow UI |
| Work daily stats | Employer totals (`work.getStatsByCompany`) + per-employee days (`work.getStatsByWorkerAndCompany`) for followed players’ factories | `work-stats-poll` | Hourly at `:10` | api2 GET batch with POST fallback + `X-API-Key` | Upsert `company_work_stats` / `worker_work_stats` (latest per company+date / company+worker+date) | Work / income views (planned) |
| Company pack | Companies + advisor inputs for a player (opportunities include live `buyPrice`/`sellPrice`) | Shell Load/Refresh (`refresh=1` busts pack) | Server TTL ~600s | Mix: companies/regions via api2; some company helpers use `X-API-Key` | `company_packs` + TQ memory; Companies page may apply session-only buy/sell overrides (not persisted) | Companies, Growth |
| User aggregate | Skills / job / income-oriented payload | `GET /api/user` on demand | Aligned with pack / Load | api2 | Server TTL patterns + TQ | Skills optimizer, income views |
| Workers / wages | Work offers / worker rows + lite skills/username | Advisor on Companies Load/Refresh: `worker.getWorkers` then batched `user.getUserLite` for unique worker ids | On Load / tool need | api2 | Ephemeral / pack-adjacent — not a long Global history | Companies (sim + badges); wage helpers |

## Storage styles in use

| Style | When we use it | Examples |
| --- | --- | --- |
| **Latest snapshot** | Care about current entity state | countries, regions, recommended_regions, MU roster |
| **Append-only history** | Care about time series / sales | price snapshots, item_market_transactions, MU stat snapshots |
| **TTL pack / KV** | Short-lived assembled payload | company_packs, generic `cache` table |
| **Client memory only** | Cross-tool reuse in one tab | TanStack Query |
| **Client prefs (LS)** | UX continuity, not SoT | recent players, equipment/calculator prefs |

We do **not** currently dual-write every entity as transactional history + latest. That remains a possible future if requirements grow (likely with a different store).

## Known gaps / pain (as observed)

- Geo refresh is mostly sweep jobs; not event-driven yet.
- Browser: no durable TTL cache for user packs / latest prices across reload.

## How to update this file

When adding or changing a WarEra-backed resource:

1. Assign **tier** (Global / Geo / User).
2. Add or edit a row: refresher, cadence, upstream, storage style, consumers.
3. If direction changes (not just as-is), update [vision.md](./vision.md) too.
