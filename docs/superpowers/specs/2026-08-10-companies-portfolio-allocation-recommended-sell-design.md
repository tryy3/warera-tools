# Companies — portfolio material allocation & recommended sell

**Date:** 2026-08-10  
**Status:** Approved for implementation  
**Surface:** Companies page (company cards, worker/AE rows, portfolio summary)  
**Related:** [Company worker simulation](./2026-08-04-company-worker-simulation-design.md), [Session buy/sell prices](./2026-08-10-companies-session-buy-sell-prices-design.md), [Company economy advisor](./2026-07-31-company-economy-advisor-design.md)

## Problem

On `/companies`, glanceable worker/company economics make it hard to choose a listing price for an item. Buy/Sell already exist on Market opportunities, but **recommended sell** should sit next to producers (workers / AE), derived from **daily cost per unit**.

Daily cost today is **wage only**. Recipe inputs are folded into Profit/PP, so costs are hard to reason about. Vertical chains (e.g. iron → steel) also need **portfolio accounting**: own output can satisfy other companies’ recipe demand before any market buy; surplus still sells; shortfall still buys.

## Goals

1. **Daily cost** = wage + **effective** recipe input cash (after portfolio allocation).
2. **Portfolio waterfall**: company outputs supply other companies’ inputs (0 transfer price); market buy covers shortfall; market sell covers surplus.
3. Show **Actual profit** (after internal use) and **If sold** (mark-to-market, no internal transfers) on each company card and at portfolio level.
4. **AE row** in the producer list (same metric pattern as workers).
5. **Recommended sell** per producer row: `dailyCost / units + ε`.

## Non-goals (v1)

- Manual waterfall priority or cheapest-first ordering (use **card / advisor order**).
- Charging consumers at the producer’s production cost (internal units are **free** on the consumer; producer keeps its own wage + input costs).
- Changing Market opportunities columns.
- Persisting allocation choices or waterfall order.
- Storage caps, Produce timing, or partial work sessions.
- Rewriting the entire sim provider from scratch (prefer allocator pass on top of existing production math).

## Decisions

| Topic | Choice |
| --- | --- |
| Approach | Two-pass: existing per-company production, then pure portfolio allocator |
| Waterfall order | UI / advisor company card order (stable list order) |
| Internal transfer price | **0** on consumer; producer does not get sell revenue for transferred units |
| Shortfall | Buy at session-effective **buy** price |
| Surplus | Sell at session-effective **sell** price |
| Supply pool | Full company output: AE + workers + self-work (if enabled) |
| Worker daily cost | `wage + rowUnits × effectiveInputCostPerUnit` |
| AE daily cost | `0 wage + aeUnits × effectiveInputCostPerUnit` (dedicated AE row) |
| Dual profit placement | Compact pair on each company card **and** portfolio header (layout A) |
| Recommended sell placement | Per producer row (worker + AE), not opportunities table |
| ε | Small fixed bump so break-even formats as tiny positive; match `formatDisplayNumber` in implementation |

## Economics

### Per company (before allocation)

Unchanged PP sources: AE, workers (wage on unboosted PP; bonus + fidelity on output only), optional self-work. Yield **units out** from total effective PP / recipe `consumedPp`.

Gross recipe demand for item inputs = `unitsOut × recipe input qty` (per input item).

### Portfolio waterfall (per item code)

For each item that appears as any company’s output or recipe input:

1. **Supply** — ordered list of producers of that item with remaining units (card order).
2. **Demand** — consumers needing that item as recipe input (any company whose recipe consumes it).
3. Fill demand from supply in producer order at **0** transfer price.
4. Remaining demand → **market buy** (cash on consumer).
5. Remaining supply → **market sell** (revenue on producer).

**Example:** Iron produces 300; steel needs 500 iron → steel pays `200 × buy(iron)`; iron sells none of the 300 transferred.

Multi-hop (ore → iron → steel): allocate **independently per item**. Each company’s full output of its product is supply for that product code. No need to topologically “run” companies in recipe order for v1 free-transfer accounting.

Multiple producers of the same input (two iron companies → one steel): consume first company’s entire available output, then the second, etc.

### Effective input cost

For a company with `unitsOut > 0`:

```
effectiveInputCostPerUnit =
  (sum of market-buy cash for all recipe shortfalls) / unitsOut
```

Internal units contribute **0** cash to this figure.

### Profits

| Metric | Meaning |
| --- | --- |
| **Actual** | Sell revenue on units **not** transferred away − wages − market input cash (after waterfall) |
| **If sold** (mark-to-market) | Assume all output sold at sell and all recipe inputs bought at buy (no internal transfers) |

Producer companies that transfer everything away: actual sell revenue on that item is 0; they still carry wage + their own recipe input cash.

### Producer rows (AE / worker / self-work)

Share company outcomes **pro-rata by row units** (`rowUnits / unitsOut` when `unitsOut > 0`):

```
rowSoldUnits = rowUnits × (soldOut / unitsOut)
rowRevenue   = rowSoldUnits × sell(output)     // transferred units → 0 revenue
dailyCost    = wageCost + rowUnits × effectiveInputCostPerUnit
profitNow    = rowRevenue − dailyCost          // “actual” at row level
recommendedSell = dailyCost / rowUnits + ε     // when rowUnits > 0
```

When the whole company output is transferred away, `soldOut = 0` → each row’s Profit now is **−dailyCost** (feeding downstream). Rows do **not** show a separate “If sold” figure in v1 (that pair stays on company + portfolio).

ε: small constant (e.g. `0.001` or one display ulp) so a true break-even still reads as ≥ tiny profit when compared at display precision.

## Architecture

```
[Pass 1] deriveCompanyCard / companyDay
         → PP, units, wages, gross recipe demand, baseline market P&L pieces

[Pass 2] allocatePortfolio(orderedCards, book)
         → transferredOut, soldOut, marketBoughtByInput,
           effectiveInputCostPerUnit, actualProfit, markToMarketProfit
           + portfolio totals

[Pass 3] enrichProducerRows
         → AE row + workers (+ self-work row if shown)
           pro-rata sold revenue, dailyCost, profitNow, recommendedSell
```

### Boundaries

| Layer | Responsibility |
| --- | --- |
| `src/economy/` (or `economy/portfolio/`) | Pure allocator + row cost/rec-sell helpers; unit-tested |
| `companies/sim/derive` (or adjacent) | Wire pass 1 → 2 → 3; session book from price board |
| Company card UI | Layout A: compact Actual / If sold; AE + workers metric grid |
| Market opportunities | Unchanged |

Prefer explicit **revenue = output × sell** and **costs = wages + input cash** in enriched views so allocation can change input cash without double-counting against Profit/PP-folded worker revenue. Pass 1 may keep existing helpers internally; pass 2/3 own the numbers the UI shows for cost/profit/rec. sell.

### Session prices

Allocator and mark-to-market both use the Companies session **effective** buy/sell book (live + overrides), same as opportunities.

## UI (layout A)

**Portfolio header**  
Compact Actual (primary) + If sold (secondary) for the sum of companies.

**Company card header**  
Same compact pair for that company (replaces or refines the single net/day badge emphasis).

**Producer list**  
1. AE row first (level + idle-style badge)  
2. Workers (existing edit/move/deactivate actions)  
3. Self-work row only if self-work is enabled and we already surface it  

Per-row metrics (as space allows): Wage (workers) · Daily cost · Profit now · Rec. sell · Units optional.

Hide Rec. sell when `rowUnits` is 0 or not finite. Zero units → daily cost is wage-only if wage exists.

## Testing (allocator first)

| Case | Expect |
| --- | --- |
| Iron 300 / steel needs 500 | Steel iron cash = 200 × buy; iron transferred 300, sold 0 |
| Two iron → one steel | Waterfall consumes company order; then market |
| Surplus iron | Extra sold at sell; contributes to iron actual profit |
| No consumers | Actual ≈ If sold for that producer |
| No recipe / missing item | No input cash; no rec. sell where units unknown |
| Session override on iron buy | Steel shortfall uses overridden buy |

Follow with derive/UI smoke that AE row and dual headers render from enriched model.

## Implementation notes

- Keep waterfall **deterministic** given card order + book.
- Do not invent cross-company gold transfers in the ledger — only who sells and who buys on the market.
- Document in UI copy (short): Actual = after using own production as inputs; If sold = as if every company sold all output and bought all inputs.

## Open implementation details (not product decisions)

- Exact ε vs `formatDisplayNumber` digits  
- Whether self-work gets its own row in the first UI slice or only counts in totals  
- How much of `companyDay` is refactored vs wrapped for explicit sell revenue
