# Economy Advisor API Caching — Design

**Date:** 2026-08-01  
**Status:** Approved for implementation  
**Depends on:** [Company Economy Advisor](./2026-07-31-company-economy-advisor-design.md)

## Goal

Cut WarEra API chatter on the Economy advisor page. Today only market prices are job-backed; every advisor load live-fetches companies, production bonuses, recommended regions, and region metadata — including useless gateway probes for procedures the gateway does not support.

## Decisions

| Topic | Choice |
| --- | --- |
| Storage style | Dedicated tables + Croner jobs for these domains (mirror `price-poll` / `country-sync`). Generic `cache` KV remains available for simpler TTL cases elsewhere — see [data-tier caching](./2026-08-02-data-tier-caching-strategy-design.md) |
| Recommended regions | Hourly job over **all** recipe item codes (~18); live miss fills + upserts |
| Regions | Table presence **is** the watchlist; request paths enqueue unknown ids; hourly job refreshes known rows |
| Cold miss | Live-fetch, persist, serve — never wait for the next hourly tick |
| Company pack | Per-`userId` table with **10 minute** TTL; manual refresh busts **only** this pack |
| Refresh button | User-specific company data only — not prices, not region/recommended jobs |
| `getProductionBonus` | Call **api2 directly** (skip gateway miss round-trip) |
| `getRecommendedRegionIdsByItemCode` | Already api2 POST + `X-API-Key` — unchanged |

## Architecture

```
[recommended-regions-poll] hourly
  → company.getRecommendedRegionIdsByItemCode (each recipe itemCode, count: 1)
  → upsert recommended_regions
  → enqueue returned region_ids into regions (if missing)

[region-sync] hourly
  → for each row in regions (prefer oldest fetched_at / null first)
  → region.getById → upsert regions

[Economy advisor]
  → prices: existing price_snapshots (unchanged)
  → company_packs: TTL read; miss or refresh=1 → live getCompanies/getById/getProductionBonus → upsert
       enqueue company region_ids into regions
  → recommended_regions: table read; miss → live fetch + upsert + enqueue region
  → regions: table read; miss → live getById + upsert
  → existing economy math (unchanged)

[Warera client]
  → getProductionBonus: force api2 baseUrl (same idea as recommended regions)
```

## Data model

### `recommended_regions`

| Column | Type | Notes |
| --- | --- | --- |
| `item_code` | text PK | e.g. `steel` |
| `region_id` | text | Best region for `count: 1` |
| `region_name` | text? | From API when present |
| `bonus` | real? | Stored as **fraction** (same normalization as `parseRecommendedRegions`) |
| `payload` | json? | Raw slice for forward-compat |
| `fetched_at` | timestamp | |

### `regions`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | Region id; row existence = watchlist membership |
| `name` | text? | |
| `country_code` | text? | |
| `payload` | json? | Useful `getById` fields |
| `fetched_at` | timestamp? | `null` = enqueued, not yet successfully fetched |
| `enqueued_at` | timestamp | First seen |

Idempotent enqueue: insert-if-missing on advisor/company/recommended paths. Hourly job refreshes all known ids (oldest / null `fetched_at` first). Failed job refresh must not wipe a still-valid previous row.

### `company_packs`

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | text PK | |
| `payload` | json | Normalized companies: id, name, itemCode, aeLevel, productionBonus, regionId, plus any fields needed for advisor cards |
| `fetched_at` | timestamp | |
| `ttl_seconds` | integer | Default `600` |

Fresh when `now - fetched_at < ttl_seconds`. Force refresh deletes or ignores TTL and re-fetches from WarEra.

## Advisor read path

1. Load latest prices (unchanged; inline poll if empty).
2. Resolve company pack for `userId` (cache hit / miss / `refresh=1`).
3. Resolve region info for company regions via `regions` (live miss → fetch + upsert).
4. For each producible recipe item: resolve best recommended region via `recommended_regions` (live miss → fetch + upsert; enqueue `region_id`).
5. Resolve best-switch region names/country codes via `regions`.
6. Run existing switch / Profit/PP math.

## Jobs

| Job id | Cron (default) | Behavior |
| --- | --- | --- |
| `recommended-regions-poll` | hourly (`0 0 * * * *`) | All recipe `itemCode`s; partial on per-item failures |
| `region-sync` | hourly (`0 0 * * * *`) | All known `regions.id`; skip empty table; partial on per-id failures |

Both register via existing `listJobDefinitions` / `syncJobsToDb` / Croner scheduler. Manual `POST /api/jobs/:id/run` works like other jobs.

Stagger defaults slightly if both fire on the same second (e.g. recommended at `:00`, region-sync at `:05`) to avoid rate-limit spikes — implementation detail.

## API / UI

| Route | Change |
| --- | --- |
| `GET /api/economy/advisor?userId=` | Reads caches as above |
| `GET /api/economy/advisor?userId=&refresh=1` | Busts / refetches **only** `company_packs` for that user |

Response additions (minimal):

- `companiesFetchedAt` — ms epoch of the pack used (same style as other API timestamps in this app)
- `companiesRefreshed` — `true` when this request fetched a new pack (miss or `refresh=1`)

UI: company pack refresh is the shell **Load/Refresh** control (see [data-tier caching](./2026-08-02-data-tier-caching-strategy-design.md)). `refresh=1` does not trigger price poll or region jobs.

## Client

- `fetchCompanyProductionBonus`: set `baseUrl: "https://api2.warera.io/trpc"` (and keep existing auth). No gateway probe.
- Recommended-regions call stays as today (api2 POST + `authStyle: "api-key"`).
- Soft-fail behavior for bonus / region name on live errors stays; prefer last DB row over clearing on failed background refresh.

## Error handling

| Case | Behavior |
| --- | --- |
| Job item fails | Continue others; job status `partial` or `error` like price-poll |
| Live miss fails | Soft-fail for that datum; do not delete a still-valid cached row |
| Empty `regions` table | Job no-ops successfully; advisor enqueues as users search |
| Empty recommended table before first job | Advisor live-fills per itemCode on first switch scan |

## Testing

- Unit: TTL freshness helper; enqueue-if-missing; parse/upsert shapes for recommended + region rows.
- Unit/integration: advisor prefers DB rows and does not call WarEra when caches are warm (mock requester).
- Unit: `refresh=1` forces company pack refetch even when TTL valid.
- Unit: `getProductionBonus` request options include api2 `baseUrl` (no gateway attempt).

## Out of scope

- Event-driven region invalidation (battles, laws) — future evolution of the watchlist.
- Parallelizing serial `getById` beyond pack-refresh needs.
- Using generic `cache` KV for these three domains.
- Changing price-poll or Profit/PP formulas.
- Multi-user pack sharing beyond per-`userId` rows.

## Success criteria

- Warm advisor load for a known user issues **no** `getRecommendedRegionIdsByItemCode` or `region.getById` WarEra calls when tables are populated; company pack served from DB within TTL.
- First load after deploy still works (live miss path).
- Gateway logs no longer show `company.getProductionBonus` 400 “unknown method” probes.
- Manual refresh updates company data without re-fetching shared region/recommended caches.
