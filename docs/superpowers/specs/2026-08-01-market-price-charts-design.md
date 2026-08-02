# Market Price Charts — Design

**Date:** 2026-08-01  
**Status:** Approved for implementation  
**Depends on:** [Company Economy Advisor](./2026-07-31-company-economy-advisor-design.md) (price poll + `price_snapshots`)

## Goal

Add a **Market** experience for current prices and per-item history, using **TanStack Charts** for a range-ribbon + market-line chart. Rename the existing Economy advisor tab to **Companies**.

Inspired by [war-era.vercel.app/economy](https://war-era.vercel.app/economy).

## Decisions

| Topic | Choice |
| --- | --- |
| Nav / routes | Rename Economy → Companies (`/companies`); new Market (`/market`, `/market/$itemCode`) |
| Old `/economy` URL | No redirect (not widely shared) |
| Chart type (v1) | Range ribbon (top buy–top sell) + market price line |
| Detail navigation | Dedicated route `/market/$itemCode` |
| History ranges | `24h` \| `7d` \| `30d`; default `7d`; URL `?range=` |
| Overview card fields | Market price + top buy + top sell (no G/PP) |
| Change stats | Detail header only: Δ 24h and Δ 7d (absolute + %) |
| Overview grouping | Raw materials / Manufactured goods / Other (from recipes) |
| Chart library | `@tanstack/charts` + `@tanstack/react-charts` (default chart stack going forward) |
| Data fetching | Existing `api()` helper; no TanStack Query in v1 |
| Server economy APIs | Keep `/api/economy/*` paths (no rename churn) |
| Schema | No change; query existing polls/snapshots |

## Architecture

```
[price-poll job] --> price_polls + price_snapshots  (unchanged)

[Market overview] --> GET /api/prices/latest
                  --> client groups items (raw / manufactured / other)

[Market detail]   --> GET /api/prices/history?itemCode=&range=
                  --> TanStack Charts (areaY ribbon + lineY market)

[Companies]       --> existing advisor UI at /companies
                  --> /api/economy/* unchanged
```

## Routes & navigation

| Label | Path | Purpose |
| --- | --- | --- |
| Companies | `/companies` | Former Economy advisor (player search, companies, opportunities) |
| Market | `/market` | Current price board |
| Market item | `/market/$itemCode?range=7d` | History chart + header stats |

- Invalid or missing `range` → treat as `7d`.
- Feature folder rename as needed (`economy` → `companies` on the web side); localStorage keys for recent players may be renamed with a one-time migration or a new key version.

## Price semantics

| UI label | Snapshot field | Meaning |
| --- | --- | --- |
| Market | `marketPrice` | From `itemTrading.getPrices` |
| Top buy | `buyMax` | Best bid in top-10 buy orders |
| Top sell | `sellMin` | Best ask in top-10 sell orders |

Chart ribbon spans top buy → top sell; market is a separate line. Crossed books (buy > sell) are drawn as stored. Null book sides omit that channel; market may still plot.

### Grouping

Using `src/economy/recipes.ts`:

- **Raw materials** — known recipe, `inputs.length === 0`
- **Manufactured goods** — known recipe, has inputs
- **Other** — item codes with prices but no recipe (omit section if empty)

## API

### Existing

`GET /api/prices/latest` — overview grid (`items[]`, `recordedAt`, etc.).

`POST /api/prices/poll` — optional refresh from Market UI.

### New

`GET /api/prices/history?itemCode={code}&range={24h|7d|30d}`

Response shape (conceptual):

```ts
{
  itemCode: string
  range: "24h" | "7d" | "30d"
  latest: {
    recordedAt: string // ISO
    marketPrice: number | null
    topBuy: number | null
    topSell: number | null
  }
  change24h: { absolute: number; percent: number } | null
  change7d: { absolute: number; percent: number } | null
  points: Array<{
    recordedAt: string
    marketPrice: number | null
    topBuy: number | null
    topSell: number | null
  }>
}
```

- Join snapshots to polls with status `success` | `partial`.
- Window: `recorded_at >= now - range`.
- Change vs nearest snapshot at or before the lookback instant; `null` if no baseline or current market is null.
- Unknown `itemCode` → 404.
- Bad or missing `range` → coerce to `7d`.

## UI

### Market overview

- Title, “as of {recordedAt}”, optional Refresh prices.
- Sections: Raw → Manufactured → Other.
- Cards link to detail: icon, name, market badge, top buy (green), top sell (red).
- Loading / empty / error states when polls are missing or fail.

### Market detail

- Back to Market.
- Header: icon, name, current market / top buy / top sell, Δ 24h and Δ 7d (muted when null).
- Range control synced to search params.
- Chart: TanStack Charts `areaY` (topBuy–topSell) + `lineY` (marketPrice); tooltip with time + three values; theme via CSS variables where practical.
- Sparse history still renders; short note if few points.

### Companies

- Same advisor behavior; nav label and `/companies` route only (plus feature rename as needed).

## Errors & edge cases

- History 404 → not-found on detail page.
- Null ribbon edge → skip that bound; plot market if present.
- Fetch failures → inline error + retry; shell stays intact.

## Testing

- Unit: history windowing, change absolute/percent/null cases, item grouping.
- API: history happy path, bad range, unknown item.
- No visual regression suite in v1.

## Out of scope (later)

- G/PP on market cards
- Candlestick / OHLC charts
- TanStack Query
- `/economy` redirects
- New DB indexes unless history queries prove slow
- Advisor / wage features

## Dependencies note

TanStack Charts is pre-alpha; APIs may change. Pin versions in `package.json` and keep chart UI in feature modules. Prefer TanStack Charts for new charts unless a real gap forces another library.
