# Data Tier Caching Strategy — Design

**Date:** 2026-08-02  
**Status:** Approved  
**Inspired by:** [WarEra Factory Optimizer](https://3dcut.github.io/warera-company-calc/?lang=en) “load data” pattern  
**Depends on / extends:**

- [Economy Advisor API Caching](./2026-08-01-economy-advisor-api-caching-design.md)
- [Factory Growth Planner](./2026-08-02-factory-growth-planner-design.md)
- [Warera Toolkit Foundation](./2026-07-31-warera-toolkit-foundation-design.md) (jobs + optional `cache` KV)

## Goal

Define how WarEra Toolkit fetches, stores, and refreshes data across tools so we:

1. Prefer **scheduled jobs** for shared, non-user data (bound WarEra API usage).
2. Give **user-specific tools** a shared client cache with a single shell **Load** control.
3. Leave a clear hook for **event-driven Geo refresh** later without redesigning tiers.

## Decisions

| Topic | Choice |
| --- | --- |
| Data tiers | **Global** / **Geo** (region, country, MU later) / **User** |
| Global + Geo refresh | Croner jobs over full datasets or watchlists; pages read our DB/API |
| User identity | Selected WarEra player (`userId` + `username`); not site auth |
| User client cache | `@tanstack/react-query`, **memory only** (no pack persistence across reload) |
| Load UX | Always-visible shell control: player search + Load/Refresh (do not hide on Global tools) |
| User resources in v1 | Existing payloads only — company pack + selected player identity; **no new WarEra endpoints** |
| First implementation slice | Client foundation: QueryClient + shell + migrate Companies & Growth |
| Event-driven Geo | Planned (`enqueueGeoRefresh`); not implemented yet |
| Storage style | Case by case: dedicated tables when history/watchlist/query shape needs it; generic `cache` KV OK for simple TTL until a domain outgrows it |

## Tier model

| Tier | Examples today | Who refreshes | Freshness |
| --- | --- | --- | --- |
| **Global** | Market prices / order tops, recommended regions by item | Croner jobs (+ rare admin/manual poll) | Minutes–hours; shared by all clients |
| **Geo** | `regions` watchlist, `countries`; **MU** when added | Jobs over a list/watchlist; cold miss live-fills | Hours–day; events may enqueue sooner later |
| **User** | Selected player id/username, `company_packs` | Client Load/Refresh → server TTL; `refresh=1` busts pack only | Short (~10m server); memory on client |

### Rules

1. **Jobs own Global and Geo.** Tool pages must not live-scrape WarEra for those on every navigation when tables are warm.
2. **User data is demand-driven.** No per-user cron. The shell Load/Refresh is the primary user-facing control.
3. **Geo watchlists grow from use + future events.** Today: advisor/company/recommended paths enqueue region ids; recipe lists drive recommended-regions poll. Later: battles, laws, etc. call the same enqueue helper; jobs remain the bulk WarEra callers.
4. **MU is Geo** (entity sync). A player’s membership in an MU is **User** when we store it.

### Classification guide for new data

When adding a resource, pick the tier by answers:

- Needed by many users the same way, independent of who is selected? → **Global**
- About a place/org that changes infrequently but is shared? → **Geo** (including **MU** when we add it)
- Different for each selected player / must stay fresher on demand? → **User**

Then pick storage: dedicated table + job if the domain needs structured queries, watchlists, or history; otherwise the generic `cache` KV is acceptable. Prefer extending an existing tier pattern over inventing a parallel cache.

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │  Croner jobs (Global + Geo)         │
                    │  price-poll, recommended-regions,   │
                    │  region-sync, country-sync, …        │
                    └───────────────┬─────────────────────┘
                                    │ write
                                    ▼
                    ┌─────────────────────────────────────┐
                    │  Turso tables (SoT for Global/Geo)  │
                    └───────────────┬─────────────────────┘
                                    │ read
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
   Market / Calculator        Hono API                   Future tools
   (Global/Geo reads)    (advisor, growth, …)
                                    ▲
                                    │ User: pack TTL / refresh=1
                                    │
                    ┌───────────────┴─────────────────────┐
                    │  SPA shell                          │
                    │  selected player + Load/Refresh     │
                    │  TanStack Query (memory)            │
                    │  ['player', id] ['companies', id]   │
                    └───────────────┬─────────────────────┘
                                    │ subscribe
                         Companies / Growth / …
```

Future (not built yet):

```
[battle / law / … listeners] → enqueueGeoRefresh({ type, ids })
                             → regions/countries/mu watchlist
                             → existing sync jobs drain list
```

## Server (Global + Geo + User packs)

### Global (keep)

| Job | Role |
| --- | --- |
| `price-poll` | Market history / latest prices |
| `recommended-regions-poll` | Best region per recipe item |

Manual poll endpoints / Market “refresh prices” remain **Global** ops, not user Load.

### Geo (keep + clarify)

| Job / path | Role |
| --- | --- |
| `region-sync` | Refresh all ids in `regions` (row presence = watchlist) |
| `country-sync` | Daily countries / tax metadata |
| Advisor cold miss | Live `region.getById` / recommended fill + upsert + enqueue |

**MU:** not in schema yet. When added: dedicated table + job + watchlist, same cold-miss pattern.

### Event enqueue stub (future)

Internal helper concept (name indicative):

```ts
enqueueGeoRefresh(input: {
  type: "region" | "country" | "mu";
  ids: string[];
}): void;
```

- Idempotent insert-if-missing (and optionally clear `fetched_at` / bump priority for re-fetch).
- First “producers” stay request paths + static lists; listeners plug in later.
- Jobs stay the only high-volume WarEra Geo callers; rate limits unchanged in spirit.

### User (server unchanged for first client slice)

- Keep `company_packs` ~600s TTL from the advisor caching design.
- `GET ...&refresh=1` busts **only** that user’s company pack.
- No new bootstrap mega-endpoint and no new WarEra procedures for this strategy.

## Client (User shared cache)

### Wiring

- Add `@tanstack/react-query`.
- Wrap the app (alongside the existing TanStack Router) with `QueryClientProvider`.
- Cache is **in-memory only**. Full page reload clears packs; recent-players `localStorage` still helps re-select a player.

### Selection state

- Selected `{ userId, username }` is shell-level state (context or small store), **not** a server query.
- Recent players list remains as today for the combobox.
- Optional: when Companies/Growth are open, keep URL `userId`/`username` search params in sync for shareable links; while the tab is alive, **shell selection is source of truth**.

### Shell UI (always visible)

In `Shell` header (in addition to nav):

- Player search/combobox (reuse Companies player-search pattern).
- **Load** / **Refresh** — first load fetches into Query cache; explicit action uses `refresh=1` for the company pack.
- Status: loaded player, loading, error, and optionally “updated … ago” from `dataUpdatedAt`.

Keep the control always on. Redesign only via a dedicated UX task if it becomes a problem.

### Query keys (v1)

| Key | Data | Source |
| --- | --- | --- |
| `['player', userId]` | `{ userId, username }` | Selection / search (no new API) |
| `['companies', userId]` | Company pack / advisor companies payload | Canonical: `GET /api/economy/advisor?userId=` (+ `&refresh=1` on explicit Load) |

Tool-specific derived views (advisor cards, growth plan) may be separate queries that **depend** on `companies` + Global price reads. Growth may still call `/api/growth/bootstrap` for growth-only fields; that path must **not** reintroduce a second player Load UI, and benefits from the warm server `company_packs` TTL when the shell already loaded the player.

Suggested client `staleTime`: on the order of the server pack TTL (or slightly under), so navigation within a session does not refetch until stale or explicit Load.

### Tool behavior after migration

| Tool | Change |
| --- | --- |
| Companies | Remove local player search + “Refresh companies”; read shell + TQ |
| Growth | Same |
| Market / Calculator / Countries | Unchanged data paths; shell player UI present but unused |
| Market price refresh | Remains Global (job/manual poll) |

Empty state when no player loaded: “Load a player in the header.”

### Load vs navigate

| Action | Behavior |
| --- | --- |
| Navigate between tools | Reuse TQ cache if present/fresh |
| Explicit Load/Refresh | Invalidate user queries; refetch company pack with `refresh=1` |
| Switch selected player | New query keys; ignore/cancel old in-flight via key change |

## First implementation slice

Ordered work after this spec is approved:

1. Install/wire `@tanstack/react-query` + `QueryClientProvider`.
2. Shell player combobox + Load/Refresh + status.
3. Canonical `['companies', userId]` query via `GET /api/economy/advisor`.
4. Migrate Companies and Growth to shell selection + shared cache.
5. Leave Global manual actions (e.g. Market refresh prices) as-is.

`enqueueGeoRefresh` remains a planned follow-up; documenting the stub is enough until event producers exist.

## Error handling

| Case | Behavior |
| --- | --- |
| No player selected | Tools show empty guidance; no user fetch |
| Load/network failure | Shell shows error; tools do not invent data; retry via Load |
| Partial advisor/growth payload | Keep existing page warnings (e.g. missing steel/concrete prices) |
| Background Geo job item fails | Unchanged: partial job, do not wipe good rows |
| User switches player mid-flight | TQ query key isolates results |

## Testing

- Hook/unit: companies query sends `refresh=1` only on explicit Load/Refresh.
- Smoke (component or Playwright): Load player in shell → Companies and Growth both render without a second Load.
- Reuse existing mocked-requester patterns for any server assertions; no new WarEra surface in this slice.

## Out of scope

- Site authentication / API-key user accounts.
- Persisting company packs across full page reload.
- New WarEra endpoints or a monolithic session dump API.
- Implementing battle/law (or other) event listeners (`enqueueGeoRefresh` producers).
- MU sync job and schema (when needed: Geo table + job + watchlist, same cold-miss pattern).
- Moving every Global/Geo read onto TanStack Query. Prefer TQ for **widely reused** server-backed data where live freshness is not required (e.g. prices across Market / Calculator / Companies). Avoid pulling heavy Geo dumps (full countries list) into the client unless a tool needs a narrow slice.
- Changing price-poll cadence, Profit/PP formulas, or advisor math.
- Job definition `tier` tags for the Jobs UI (revisit only if filtering becomes necessary).

## Success criteria

- Load a player once in the header → Companies and Growth both work from the shared client cache.
- Explicit Load refreshes **user** company data only (`refresh=1`), not price/region jobs.
- New resources can be classified into Global / Geo / User using this doc without inventing a fourth ad-hoc cache style.
- Event-driven Geo can attach later via enqueue + existing jobs without changing the tier model.

## Relationship to prior specs

- Advisor caching remains the SoT for server pack TTL, region watchlist, and recommended-regions jobs.
- This doc **supersedes** the Companies-page-local “Refresh companies” UX in favor of the shell Load control once the first slice lands.
- Growth planner continues to reuse company pack + prices; it should consume the shared client companies query instead of its own parallel player/load UI.
