# Company Economy Advisor — Design

**Date:** 2026-07-31  
**Status:** Approved for implementation  
**Depends on:** [WarEra Toolkit Foundation](./2026-07-31-warera-toolkit-foundation-design.md)

## Goal

Help decide **what to produce** and **whether switching material/region is worth the Concrete cost**, using live market prices and company data.

Inspired by [war-era.vercel.app/economy](https://war-era.vercel.app/economy), scoped for this toolkit.

## Decisions

| Topic | Choice |
| --- | --- |
| Price source of truth | Append-only `price_polls` / `price_snapshots` — no separate KV “latest” cache for market prices |
| Poll cadence | Hourly Croner job (`price-poll`) |
| Market price | `itemTrading.getPrices` (used for Profit/PP in v1) |
| Order book | Same job: `tradingOrder.getTopOrders` limit 10 per item; store buy/sell min/max/avg |
| Item set | Keys returned by `getPrices` |
| Scraps calculator | Read latest `scraps` from history; refresh triggers a price poll write path |
| User selection | WebUI search by name → `search.searchAnything` → `user.getUserLite` → companies |
| Wages / employees | Out of scope for v1 |
| Best region | `company.getRecommendedRegionIdsByItemCode` (auth required; documented on [realmarijn API explorer](https://warera.realmarijn.nl/api-explorer); official OpenAPI incomplete — **explicit override**) |
| Current company bonus | Prefer `company.getProductionBonus` when available; else company payload fields |
| Profit/PP inputs | Net out recipe input costs at market price of inputs |
| Transfer cost | 5 Concrete (retask) and/or 5 Concrete (relocate) × concrete market price |
| UI | New **Economy** tab |

## Architecture

```
[price-poll job] --> itemTrading.getPrices
                 --> tradingOrder.getTopOrders (per item)
                 --> price_polls + price_snapshots

[Economy UI] --> /api/economy/search?q=
             --> /api/economy/advisor?userId=
             --> /api/prices/latest  (opportunities board)

[Advisor] --> company.getCompanies / getById / getProductionBonus
          --> company.getRecommendedRegionIdsByItemCode
          --> latest price_snapshots
          --> src/economy/* (pure math)

[Calculator scraps] --> latest scraps from price_snapshots
                    --> POST refresh runs shared poll writer
```

## Data model

### `price_polls`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer PK | |
| `recorded_at` | timestamp | Batch time |
| `status` | text | `success` \| `partial` \| `error` |
| `error` | text? | |
| `item_count` | integer | Snapshots written |

### `price_snapshots`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer PK | |
| `poll_id` | FK → price_polls | |
| `item_code` | text | e.g. `steel` |
| `market_price` | real? | From getPrices |
| `buy_min` / `buy_max` / `buy_avg` | real? | Top-10 buy |
| `sell_min` / `sell_max` / `sell_avg` | real? | Top-10 sell |

Unique `(poll_id, item_code)`. “Latest” = rows for `max(recorded_at)` successful/partial poll.

## Economy math (v1)

Recipes from wiki / `companies.md`. For item with `consumedPP` and inputs:

```
unitProfit = marketPrice(item) − Σ(qty × marketPrice(input))
profitPerPP = unitProfit / consumedPP
dailyValue_AE ≈ aeLevel × (1 + bonus) × 24 × profitPerPP
```

Switch recommendation (per company):

1. Current daily AE value at current item + current bonus.
2. For each producible item: best recommended region bonus (`count: 1`) → raw daily value.
3. Δdaily = best raw − current.
4. Transfer: material change and/or region change → 5 or 10 Concrete × concrete price.
5. Payback days = transferCost / Δdaily (when Δdaily > 0).

## API (Hono)

| Route | Purpose |
| --- | --- |
| `GET /api/prices/latest` | Latest market + order aggregates |
| `POST /api/prices/poll` | Run poll now (also used by scraps refresh) |
| `GET /api/scraps` | Latest scraps (compat) |
| `POST /api/scraps/refresh` | Trigger poll; return scraps |
| `GET /api/economy/search?q=` | User search results |
| `GET /api/economy/advisor?userId=` | Companies + opportunities + switch stats |

## Out of scope (later)

- Wage / employee profitability
- “Buy new company” growth advisor
- Historical charts / fluke detection UI
- Prefer buy/sell book for Profit/PP instead of market price
- Moving price history off Turso if volume grows
