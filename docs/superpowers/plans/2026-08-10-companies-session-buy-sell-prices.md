# Companies Session Buy/Sell Prices — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Companies page uses top Buy (`buyMax`) / Sell (`sellMin`) for Profit/PP, shows those columns, supports session item-price overrides via an opportunities detail modal, and applies overrides to all companies on the page.

**Architecture:** Extend economy profit helpers to take buy/sell maps; advisor exposes buy/sell on opportunities and company breakdowns. Companies page holds a session `ItemPriceBoard` provider; derive recomputes opportunity + company profit from effective prices.

**Tech Stack:** Existing Drizzle prices, `src/economy/profit.ts`, React context on Companies page, TanStack Table.

**Spec:** [../specs/2026-08-10-companies-session-buy-sell-prices-design.md](../specs/2026-08-10-companies-session-buy-sell-prices-design.md)

## Global Constraints

- Buy = `buyMax`, Sell = `sellMin` (Market UI).
- Default Profit/PP: `(sell(output) − Σ qty×buy(input)) / consumedPp`.
- Overrides: Companies page session only; shared by `itemCode`.
- Growth/other pages: keep working; if they still pass a flat `marketPrice` map, adapt via adapter or dual API carefully.
- Run tests: `node_modules/.bin/vp test <paths>`.

## File map

| File | Role |
| --- | --- |
| `src/db/prices.ts` | `buyPriceMap` / `sellPriceMap` (or combined) |
| `src/economy/profit.ts` | Buy/sell profit formula; fields on breakdown |
| `src/economy/profit.test.ts` | Formula + list opportunities |
| `src/economy/advisor.ts` | Use buy/sell maps |
| `src/economy/advisor.test.ts` | Seed buy/sell; expect new G/PP |
| `src/web/features/companies/types.ts` | Opportunity buy/sell fields |
| `src/web/features/companies/sessionPrices/*` | Provider + effective price helpers |
| `src/web/features/companies/sim/derive.ts` | Effective profitPerPp for cards |
| `src/web/features/companies/MarketOpportunitiesTable.tsx` | Columns + open modal |
| `src/web/features/companies/OpportunityItemModal.tsx` | Detail + edit forms |
| `src/web/features/companies/CompaniesPage.tsx` | Wire provider |
| `docs/warera-api/inventory.md` | Brief note |

---

### Task 1: Price maps + profit buy/sell formula

- [ ] Add `buyPriceMap` / `sellPriceMap` from `LatestPrices` (`buyMax` / `sellMin`).
- [ ] Change profit calculation to accept `{ buy, sell }` maps (keep thin wrapper for old flat map if Growth needs it: treat flat as both buy and sell = marketPrice).
- [ ] Extend `ProfitPpBreakdown` with `buyPrice`, `sellPrice` (output item live sides used).
- [ ] Update formula string to mention sell − buy inputs.
- [ ] Tests green; commit `feat(economy): Profit/PP from buy/sell order book prices`

### Task 2: Advisor uses buy/sell

- [ ] `buildAdvisor` builds buy/sell maps; passes into opportunities + company profitBreakdown.
- [ ] Tests seed buyMax/sellMin; assert opportunity fields + G/PP.
- [ ] Commit `feat(economy): advisor opportunities expose buy/sell prices`

### Task 3: Session price board + client recompute

- [ ] `ItemPriceBoardProvider` with overrides map; `useItemPriceBoard`.
- [ ] Pure `effectiveBookPrices(live, overrides)` and `recomputeOpportunity` / company profit helper (can live under `sessionPrices/` or reuse economy with maps).
- [ ] Tests for merge + recompute; commit `feat(companies): session item buy/sell price board`

### Task 4: Table + modal + derive wiring

- [ ] Table: Buy, Sell columns; remove Formula; row opens modal; dirty styling + title with live price.
- [ ] Modal: live vs edit, apply/reset, show formula.
- [ ] `deriveCompanyCard` + summary Profit/PP use effective sell/buy for that company’s item.
- [ ] Wrap Companies page with provider.
- [ ] Inventory one-liner; commit `feat(companies): opportunities modal and session price overrides`

## Spec coverage

| Requirement | Task |
| --- | --- |
| Default buy/sell Profit/PP | 1–2 |
| Table Buy/Sell columns | 4 |
| Formula in modal | 4 |
| Session overrides shared by item | 3–4 |
| Dirty indication + live visible | 4 |
| Company cards use effective prices | 4 |
| No LS / other pages | 3 |

Inline execution after plan commit.
