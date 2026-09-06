# Gear, scraps, and market tax

Implemented in `src/calculator/`. Keep this file aligned when yields or tax rules change.

## Goal

Decide **sell gear on the market** vs **dismantle → sell scraps**.

## Scrap yields by tier

Yield depends on **tier only** (not helmet/weapon/etc.):

| Tier | Labels | Scraps |
| --- | --- | --- |
| gray | Gray / Basic | 6 |
| green | Green / Reinforced | 18 |
| blue | Blue / Advanced | 54 |
| purple | Purple / Elite | 162 |
| yellow | Yellow / Legendary | 486 |
| red | Red / Mythic | 1458 |

Pattern: each tier is **×3** the previous scrap amount (6 → 18 → 54 → …).

## Craft costs (factory craft)

Craft **consumes** scraps + steel. Scrap qty is close to but not always identical to dismantle yield (mythic craft 1460 vs dismantle 1458). Random craft uses **half** the steel of a specific item; scrap qty is the same.

| Tier | Scrap | Steel (random / specific) |
| --- | --- | --- |
| Mythic (red) | 1460 | 32 / 64 |
| Legendary (yellow) | 486 | 16 / 32 |
| Epic (purple) | 162 | 8 / 16 |
| Rare (blue) | 54 | 4 / 8 |
| Uncommon (green) | 18 | 2 / 4 |
| Common (gray) | 6 | 1 / 2 |

App: `src/equipment/craft.ts` (`CRAFT_COSTS`, craft-vs-scrap compare).

## What is taxed

| Value | Taxed? | Notes |
| --- | --- | --- |
| Market **listing / incl. price** | Yes (country tax) | Buyer-facing price includes tax |
| **Excl. price** (seller receive) | Derived | `inclPrice / (1 + taxRate)` |
| **Scrap market price** | Use API price as given | Applied as `scrapPrice × scrapAmount` for dismantle value |
| Dismantle vs sell **comparison** | Tax on the gear sale side | Profit = excl gear proceeds − dismantle value |

`taxRate` is a fraction (e.g. `0.01` = 1%), stored per country in this app’s DB — not synced from WarEra yet.

## Formulas

Inputs: `scrapPrice`, `scrapAmount`, `inclPrice`, `taxRate`

| Output | Formula |
| --- | --- |
| `dismantleValue` | `scrapPrice * scrapAmount` |
| `exclPrice` | `inclPrice / (1 + taxRate)` |
| `profit` | `exclPrice - dismantleValue` |

- `profit > 0` → listing beats dismantle  
- `profit < 0` → prefer dismantle

### Worked example

`scrapPrice = 0.215`, green (`scrapAmount = 18`), `inclPrice = 3.9`, `taxRate = 0.01`:

- dismantle = `3.870`
- excl = `3.861…`
- profit ≈ `-0.009` → prefer dismantle

## Live scrap price

WarEra: `itemTrading.getPrices` → `scraps` (see warera-api). This app stores prices in `price_snapshots` via the hourly `price-poll` job (Calculator reads latest scraps; POST `/api/scraps/refresh` runs a poll).
