# WebUI TanStack Routing — Design

**Date:** 2026-08-01  
**Status:** Approved for implementation planning  
**Scope:** File-based TanStack Router for WebUI tabs; optional shareable search params on Calculator and Economy  
**Out of scope:** Jobs deep links, Countries form state in URL, nested `/economy/users/:id` paths, API changes

## Goal

Give each WebUI tab its own URL so refresh and share land on the same page. Structure routes for future nested pages. Put durable Calculator and Economy selections in optional search params (omit-by-default).

## Decisions

| Topic | Choice |
| --- | --- |
| Router | TanStack Router, file-based (`@tanstack/router-plugin`) |
| Tab navigation | Path routes under `Shell` layout; `Link` instead of local `TabId` state |
| Shareable state (this pass) | Calculator + Economy only; skip Jobs |
| Param style | Search params; omit keys when using page defaults / empty UI |
| History for search edits | `replace: true` (no back-stack spam) |
| History for tab changes | Normal push navigation |
| Search validation | Lightweight `validateSearch` parsers (no new Zod dependency) |
| Generated route tree | Commit `routeTree.gen.ts` so CI/typecheck works without a prior generate step |
| Server / API | Unchanged; production SPA fallback already serves `index.html` |

## Route map

| Path | Page | Search params |
| --- | --- | --- |
| `/` | Dashboard | none |
| `/jobs` | Jobs | none |
| `/calculator` | Calculator | optional `tier`, `country`, `price` |
| `/economy` | Economy | optional `userId`, `username` |
| `/countries` | Countries | none |

Unknown paths: redirect to `/` (no dedicated not-found page in this pass).

## Optional search params

**Rule:** Params are omit-by-default. Absence means “use page defaults / empty UI.” Presence means “apply this value.” Never write defaults into the URL on first visit.

### Calculator (`/calculator`)

| Param | When present | When absent |
| --- | --- | --- |
| `tier` | Use that gear tier (`gray` \| `green` \| `blue` \| `purple` \| `yellow` \| `red`) | Default `green` |
| `country` | Use that country id | Default picker (`sweden` if available, else first loaded country) |
| `price` | Prefill incl. price field | Empty field |

On change: if value ≠ default (or empty for `price`), set the key; if it returns to default/empty, **remove** the key. Use `navigate({ search, replace: true })`.

### Economy (`/economy`)

| Param | When present | When absent |
| --- | --- | --- |
| `userId` | Select that user and load advisor | No selection; search UI as today |
| `username` | Display label when opening a shared link | Derive from search/API when picking in-UI |

Selecting a user writes params; clearing selection removes them. Search-as-you-type stays local (not in the URL).

### Not in URL (this pass)

- Jobs selected-job / runs panel
- Countries add/edit form fields
- Economy search query string

## Architecture

### File layout

```
src/web/
  main.tsx                 # createRouter + RouterProvider
  routeTree.gen.ts         # generated, committed
  routes/
    __root.tsx             # Shell + Outlet
    index.tsx              # Dashboard
    jobs.tsx
    calculator.tsx         # validateSearch + Calculator page
    economy.tsx            # validateSearch + Economy page
    countries.tsx
  layout/Shell.tsx         # Links; drop TabId / onTabChange state
  App.tsx                  # remove (router owns composition)
  features/...             # pages keep API/UI; sync selection via route search APIs
```

### Dependencies

- `@tanstack/react-router`
- `@tanstack/router-plugin` (Vite)

### Data flow

1. Page mounts → read optional search via `Route.useSearch()`.
2. Local UI state initializes from search when present, else defaults.
3. User edits → `navigate` with a search updater that adds/removes keys only.
4. Feature pages remain owners of `api()` fetching; router only syncs URL ↔ selection.

### Shell

Remove `TabId` / `useState` tab switching. Nav items are `Link`s; active styling from router/`Link` active props.

## Invalid / stale params

| Case | Behavior |
| --- | --- |
| Unknown `tier` | Treat as absent; use default `green` |
| Unknown `country` | After countries load, fall back to default picker |
| Non-numeric `price` | Ignore; do not apply to the field (may strip key on next navigate) |
| Economy `userId` fetch fails | Show existing error UI; keep params for refresh/retry |
| `userId` without `username` | Still load advisor; show username from response when available |

## Server & Vite

- Production: existing `serveStatic` + `index.html` fallback for `/*` — keep.
- Dev: ensure SPA fallback for client routes (Vite `appType: 'spa'` and/or router plugin defaults) so refresh on `/calculator` works on `:5173`.
- No Hono API or auth changes.

## Testing

- Unit: search validators / strip-default helpers (optional keys, invalid values).
- Light: assert `/calculator?tier=blue` (and similar) parses to expected search object.
- No Playwright requirement in this pass.

## Future (explicitly deferred)

- Nested paths such as `/economy/users/$userId` or `/jobs/$jobId`
- Putting more page filters in the URL
- Broader TanStack Query / table adoption (compatible later; not required here)

## Success criteria

1. Refreshing on any tab URL reloads that tab, not always Dashboard.
2. Nav uses real URLs; browser back/forward moves between tabs.
3. Sharing `/calculator?tier=blue&country=sweden` applies those values; bare `/calculator` uses defaults and does not immediately pollute the URL with defaults.
4. Sharing `/economy?userId=…&username=…` loads that player’s advisor; bare `/economy` shows empty selection.
5. Jobs remains a plain `/jobs` route with no shareable selection state.
