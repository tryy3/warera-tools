# Equipment Market Pricing UI — Design

**Date:** 2026-08-05  
**Status:** Approved for implementation  
**Depends on / extends:**

- [Item Market Transactions Poll](./2026-08-04-item-market-transactions-design.md) (sales history ingest)
- [Data Tier Caching Strategy](./2026-08-02-data-tier-caching-strategy-design.md) (Global tier reads)
- Gear economy / scrap + tax: `.agents/skills/warera-game-mechanics/gear-economy.md` + `src/calculator/`
- Country tax rates: existing `countries` table (Calculator already uses these)

**Inspiration (external):** [WarEra Stonks equipment](https://warera-stonks-kappa.vercel.app/equipment) — overview + per-item detail; we diverge on metrics (median vs min/avg), scrap floor, tax triad, and ±band stats.

## Goal

Give sustain **buyers** and dump / stats-worthy **sellers** one Equipment Market tool (overview → detail) so they can:

- Judge whether a price is a fair deal for a target roll (± playroom per skill)
- See multi-day market level to decide wait vs buy
- Compare listing economics to **dismantle → scrap** using country tax (incl vs excl)

Browser talks only to our Hono API. No new WarEra pollers — consume existing `item_market_transactions` + scrap prices.

## Decisions

| Topic | Choice |
| --- | --- |
| Personas | **Combined** — same overview + detail; no buyer/seller mode switch |
| Primary market metric | **Median** of sales in window (tax **incl** as stored). Demote min (friend sales) |
| Price triad | Market (incl) · Seller net (excl) · Scrap floor |
| Scrap floor | Tier scraps × live scrap price (tier-global; show on overview + detail) |
| Stat control | Per-skill **target** + editable **±band** (default ±1), AND across skills |
| First visit default | **Lowest observed** skills for that item in the window (numbers show immediately) |
| Remember / load | `loadStats(itemCode)` from day one: v1 = last-used local storage; later = build profile |
| Country / tax | **Independent** Equipment country picker (not shared with Calculator) |
| Calculator | Keep for now; detail embeds break-even / recommend via `calculateProfit`. Deprecate Calculator later if Equipment replaces it |
| Overview columns | Market, scrap floor, spread, trades — not min, not excl |
| Time window (v1) | **24h** default; 7d optional later |
| Charts (detail) | Multi-day median for active band vs scrap; stat ladder (bucket medians) |
| Out of v1 | Live offers, build-profile UI, Calculator removal, IQR / outlier filter, auth |

## Product shape

### Routes

| Route | Role |
| --- | --- |
| `/equipment` | Overview — browse by tier/item |
| `/equipment/$itemCode` | Detail — band, triad, trend, recommend |

### Shared vocabulary

| Name | Definition |
| --- | --- |
| Market | Median of matching sale prices in window, tax **incl** |
| Seller net | `market / (1 + taxRate)` (or listing excl when comparing a candidate list price) |
| Scrap floor | `scrapAmountForTier(tier) * scrapPrice` |
| Spread | Market − scrap floor (overview seller signal) |
| Break-even incl | Scrap floor expressed as tax-incl list: `scrapFloor * (1 + taxRate)` |

Formulas align with existing `calculateProfit` (`exclPrice = incl / (1 + taxRate)`, `profit = excl − dismantleValue`).

## Overview page

**Chrome (sticky):** scrap price · Equipment country picker (tax %) · window (24h) · sort (spread | trades | market | name)

**Grouping:** By gear tier (Gray → Mythic). Tier header shows scrap floor once.

**Row per `itemCode`:**

| Column | Notes |
| --- | --- |
| Item | Name + rarity cue |
| Market | Median, **all variants blended**, tax incl |
| Scrap floor | Same basis as tier (keep for scan/sort) |
| Spread | Market − floor; color healthy / thin / scrap-ish |
| Trades | Count in window |

**Not on overview:** min price, seller excl, per-stat bands.

**Click** → detail. **0 trades:** market “—”, floor still shown, spread muted.

## Detail page

**Header:** Back · name · tier · skill labels · window · country (same Equipment memory as overview)

### Stats load

```
loadStats(itemCode) →
  last-used { targets, bands } if present
  else lowest observed skill values in window
```

- Each skill: target + editable ±band (default 1), remembered together per `itemCode`
- Filter: sale matches if **every** skill is within its band (weapons: e.g. Atk 89±2 AND Crit 13±1)
- Changing target/band writes last-used
- Future build profiles plug into the same load function without redesigning the page

### Price triad + recommend strip

Always show scrap floor. Show market median for the active band. Show seller net by default; allow a simple toggle to hide if noisy.

**Recommend strip** (Calculator absorb):

- Break-even incl
- Attractive list (v1: break-even + 5%; constant OK)
- Compare to current market median  

Same engine as `src/calculator/profit.ts` — no duplicate tax math.

### Charts

1. **Multi-day median** (active band, incl) vs scrap floor — wait vs buy / still clearing scrap  
2. **Stat ladder** — bucketed medians across observed roll range; mark active band  

No mode switch: low band naturally emphasizes scrap/recommend; mid/high emphasizes market trend.

## Architecture

```
[Browser]
  TanStack Query → GET /api/equipment/overview
                 → GET /api/equipment/:itemCode (+ skill band params)
  localStorage   → equipment country; per-itemCode targets/bands (versioned)

[Hono]
  read item_market_transactions (filter window, itemCode, skills)
  read latest scraps price + countries.taxRate
  scrapAmountForTier + calculateProfit helpers
  aggregate medians / counts / ladder buckets / daily series

[Existing jobs — unchanged]
  item-market-tx-backfill / item-market-tx-poll
  price-poll (scraps)
```

### API (suggested)

| Endpoint | Returns |
| --- | --- |
| `GET /api/equipment/overview?window=24h` | Per-item market median, trades, tier, scrap floor, spread; plus scrap price + meta |
| `GET /api/equipment/:itemCode?window=24h&…skills` | Triad inputs, matching trades / daily medians, observed skill ranges, ladder buckets, lowest-observed defaults |

Skill filters: query params or small JSON body if multi-skill bands make query strings ugly — pick one style in the implementation plan and stay consistent.

Country for tax: client sends `countryId` (or code) on requests that need excl / break-even, **or** server accepts it as query; Equipment UI owns which country is selected (not Calculator’s storage key).

### Client persistence

| Key (conceptual) | Contents |
| --- | --- |
| `equipmentPrefs:v1` | `{ countryId }` |
| `equipmentStats:v1:<itemCode>` | `{ targets: Record<skill, number>, bands: Record<skill, number> }` |

Corrupt JSON → ignore, fall back to defaults. No auth required for v1 last-used.

## Empty states & errors

| Case | Behavior |
| --- | --- |
| 0 trades (overview row) | Market “—”; floor OK; spread muted |
| 0 matches in band (detail) | Triad market/excl “—”; floor + break-even still; charts empty/hidden with short message |
| Unparseable skills on a tx | Exclude from skill-filtered sets |
| No country selected | Prompt to pick; disable seller net / break-even until set — do not invent 0% tax |
| Missing scrap price | Warn; don’t fake floor/recommend |
| API failure | Query error UI; no fabricated medians |

## Testing

- **Unit:** median helper; multi-skill AND band filter; break-even incl via `calculateProfit` + tier scraps  
- **API:** overview aggregation fixture; detail band filter fixture  
- **UI (light):** loadStats precedence (last-used over lowest); Equipment country key ≠ Calculator country key  

## v1 done when

- Overview + detail work against real ingested txs  
- Triad + recommend strip correct for a chosen Equipment country  
- Last-used targets/bands survive refresh  
- Calculator still shipped unchanged in role  

## Future (explicit non-goals for v1)

- Named build / preference profiles feeding `loadStats`  
- Deprecate Calculator page once Equipment covers dump-vs-list  
- IQR / trimmed means; drop sales far below scrap as non-market  
- Cross-slot band memory (chest +2 / pants −2) via builds  
- 7d window, live offers  
- Buyer budget ceiling line on the trend chart (sustain UX nicety; not required for v1 triad/recommend)  

## Open points for implementation plan (non-blocking)

- Exact query param encoding for multi-skill bands  
- Attractive margin constant (5%) vs user-editable later  
- Nav label / placement in existing shell  
- Whether overview omits scrap floor column when identical to tier header (prefer keep for sort)  
