# Market opportunities — AE6 rough daily

**Date:** 2026-08-04  
**Status:** Approved for implementation  
**Surface:** Companies page → Market opportunities table  
**Related:** `src/economy/advisor.ts`, `src/economy/profit.ts`, company economy advisor

## Problem

The Market opportunities table ranks items by **Profit/PP** only. Company **best switch** recommendations maximize **AE daily gold**, which multiplies Profit/PP by `(1 + production bonus)` at each item’s best recommended region. High G/PP items can lose to lower G/PP items with a stronger region bonus. The table currently gives no bonus-adjusted figure, so the correlation is hard to see.

## Goal

Enrich each opportunity row with a **rough AE daily value** at a fixed reference AE level and that item’s best known region bonus, so players can compare “market G/PP” vs “what you actually earn per day with bonus.”

## Non-goals

- Customizable AE level in the UI (constant now; easy to wire later)
- Re-sorting the table by rough daily (keep G/PP order)
- Changing Growth `opportunitiesLite` or best-switch logic
- Per-company AE in the shared table
- Transfer cost / payback in the opportunities table

## Background (AE multiplier)

For idle AE, `dailyValue = AE × (1 + bonus) × 24 × Profit/PP`. AE is a shared multiplier: ranking by `Profit/PP × (1 + bonus)` is independent of AE level. Absolute G/day scales with AE. Fixed **AE 6** is enough for comparison.

## Design

### Reference constant

```ts
export const OPPORTUNITY_REFERENCE_AE = 6;
```

Single module-level constant (e.g. in `src/economy/profit.ts` or next to advisor enrichment). Future customization changes this (or a query param) without redesigning the table.

### Opportunity enrichment (server)

`listMarketOpportunities(prices)` stays as today: Profit/PP breakdowns sorted descending by `profitPerPp`.

After the advisor has recommended regions (same cache / fetch path used for switch scan), map each opportunity to an enriched shape:

| Field | Source |
| --- | --- |
| Existing Profit/PP fields | unchanged |
| `bestBonus` | Recommended region `bonus` for `itemCode`, or `null` if unknown |
| `bestRegionId` / `bestRegionName` | From recommended region when present; else `null` |
| `roughDailyValue` | `explainAeDaily(OPPORTUNITY_REFERENCE_AE, bestBonus, profitPerPp).dailyValue` when `profitPerPp` and `bestBonus` are non-null; else `null` |
| `referenceAeLevel` | Always `OPPORTUNITY_REFERENCE_AE` (so the client can label without hardcoding) |

**Missing recommended region:** show `bestBonus` / `roughDailyValue` / region fields as `null` (UI: `—`). Do **not** silently assume 0% bonus for the daily column — that would look like a real unboosted estimate and confuse comparison with boosted rows.

Enrichment runs in `buildAdvisor` (or a small pure helper called from it) so switch scan and the table share one recommended-region lookup.

### API / client types

Extend Companies advisor `opportunities` (and `Opportunity` in `src/web/features/companies/types.ts`) with the new fields. Growth bootstrap continues to use G/PP-only lite rows — **out of scope**.

### UI

Companies → Market opportunities:

| Item | G/PP | Best bonus | ~G/day (AE6) | Formula |

- Column header / blurb note that ~G/day uses **AE 6** and each item’s **best known region** bonus.
- Best bonus: e.g. `+61.0%` when present; `—` when null.
- Optional compact region hint (e.g. next to bonus or in a title attribute) using `bestRegionName` — nice-to-have if layout allows; not required for v1 if the table feels tight.
- Sort order unchanged (G/PP).
- Empty / no prices: same empty state; colspan updated for new columns.

### Tests

- Pure enrichment helper (preferred) or advisor test: given Profit/PP rows + recommended bonus map, AE6 daily matches `explainAeDaily`; rows with no region keep `roughDailyValue: null`; order remains G/PP.
- Client types accept the new fields (existing fetch tests need no behavioral change beyond fixtures if they assert exact opportunity shape).

## Success criteria

1. Opening Companies with prices + recommended regions shows Best bonus and ~G/day (AE6) next to G/PP.
2. Items with strong region bonuses show higher ~G/day even when G/PP is lower (e.g. Concrete vs Steak when steak’s best bonus is weak).
3. Missing region data shows `—` for bonus/daily, not a fake 0% daily.
4. Growth planner and best-switch behavior unchanged.

## Future

- User-selectable reference AE (default 6).
- Optional sort toggle: G/PP vs ~G/day.
- Show best region name/flag in the row by default.
