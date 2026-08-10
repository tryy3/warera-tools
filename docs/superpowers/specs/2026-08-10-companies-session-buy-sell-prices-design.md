# Companies — session buy/sell prices (Market opportunities)

**Date:** 2026-08-10  
**Status:** Implemented  
**Surface:** Companies page (opportunities table + company cards)  
**Related:** [Market opportunities AE daily](./2026-08-04-market-opportunities-ae-daily-design.md), [Company worker simulation](./2026-08-04-company-worker-simulation-design.md), Market item cards (`buyMax` / `sellMin`)

## Problem

Companies Profit/PP today uses a single **marketPrice** mid-ish signal. Players often plan around the order book:

- **Sell** finished goods near the lowest ask (list / hold for a better ask).
- **Buy** inputs near the best bid when stocking up.

They also want to temporarily assume custom buy/sell levels (e.g. hold iron until 0.09) and see that reflected for **every company** producing that item — without polluting Market/Growth or surviving a full page refresh (v1).

The opportunities **Formula** column is wide and better suited to a detail view.

## Goals

1. Default Companies economics to **top buy / top sell** (same meaning as Market UI), not `marketPrice`.
2. Add **Buy** and **Sell** columns to Market opportunities.
3. Move formula into an **item detail modal** with editable buy/sell.
4. Session-only overrides on the Companies page; shared by item across all companies + opportunities on that page.
5. Clear indication when a price is overridden; always able to see live (polled) values.

## Non-goals

- localStorage / DB persistence of overrides (future).
- Changing Global `price-poll` storage or Market page behavior.
- Changing Growth `opportunitiesLite`.
- Per-company price overrides (superseded by per-item session map).
- Editing input recipe quantities or consumed PP.

## Price semantics (align with Market)

| UI label | Snapshot field | Meaning |
| --- | --- | --- |
| **Buy** | `buyMax` | Best bid (top buy) — Market “Buy” |
| **Sell** | `sellMin` | Best ask (top sell) — Market “Sell” |

**Default Profit/PP (listing / optimistic, per player mental model):**

```
unitProfit = sell(output) − Σ (qty × buy(input))
profitPerPp = unitProfit / consumedPp
```

- Output valued at **Sell** (list near ask).
- Inputs costed at **Buy** (stock near bid).
- Missing buy/sell for a required item → treat like today’s missing price (`profitPerPp` null / `—`).

Fallback if buy or sell null but `marketPrice` exists: use `marketPrice` for the missing side only (document in UI as degraded); prefer showing `—` in the Buy/Sell column when that side is null.

## Design

### 1. Server: expose buy/sell on opportunities (+ company breakdowns)

Extend advisor opportunity / profit breakdown payloads used by Companies with live:

- `buyPrice` (`buyMax`)
- `sellPrice` (`sellMin`)
- keep existing `marketPrice` for reference / fallback if still useful in formula text

`listMarketOpportunities` / `calculateProfitPerPp` path should compute Profit/PP with the buy/sell formula above (not `marketPrice` alone). Company `profitBreakdown` / `currentProfitPerPp` on the same advisor response must use the **same** formula so cards and table stay consistent **before** any client override.

Wire `getLatestPrices` → maps for buyMax/sellMin into the profit helper (extend beyond `marketPriceMap`).

### 2. Client session price board

On the Companies page only (provider next to or inside existing sim provider):

```ts
type ItemPriceOverride = { buy?: number; sell?: number };
// state: Record<itemCode, ItemPriceOverride>
```

- Effective price: `override ?? live`.
- Empty / clear control removes that side’s override.
- Reset on full page reload (React state only).
- Does not write to TanStack Query cache for `/api/user` Market routes.

### 3. Derive company + opportunities on the client

When overrides exist (or always, for one code path):

- Recompute opportunity rows’ `profitPerPp`, `unitProfit`, `inputCost`, `roughDailyValue`, formula string from effective buy/sell + recipes (pure helper shared with tests).
- Recompute each company card’s effective `profitPerPp` / day math the same way (replace today’s sole use of `currentProfitPerPp` from the server when deriving).

Server remains source of live buy/sell and baseline; client applies session overrides.

### 4. Market opportunities table

| Column | Notes |
| --- | --- |
| Item | unchanged; row opens modal |
| Buy | effective buy; dirty styling if overridden |
| Sell | effective sell; dirty styling if overridden |
| G/PP | from effective prices |
| Best bonus | unchanged |
| ~G/day | from effective G/PP |
| ~~Formula~~ | removed |

**Dirty cue:** muted live value in tooltip/`title`, and/or accent text / small “custom” mark on overridden cells.

### 5. Item detail modal

Opened from row click (and optional explicit control).

Contents:

- Item name / icon  
- Live Buy / Sell (read-only)  
- Editable Buy / Sell (prefilled with effective)  
- Reset to live  
- Formula string (effective numbers)  
- Optional: G/PP and ~G/day under effective prices  

Edits update the session map immediately (or on Save — prefer **Apply** / live update on blur-or-Apply to avoid keystroke thrash; either is fine if tested).

### 6. Company cards

- Summary **Profit/PP** shows **effective** value (fix today’s live-only `currentProfitPerPp` display).
- Worker day / max wage / nets use effective `profitPerPp` from derive.

## Testing

- Pure: profit from buy/sell maps; override merge; rough daily recomputed.
- Advisor: opportunities include buy/sell; G/PP uses sell−buy formula.
- UI/unit: table columns; modal override marks dirty; company derive picks up item override for two companies same itemCode.

## Inventory

Update `docs/warera-api/inventory.md` only if Companies consumption of price snapshots changes materially (buy/sell fields in advisor pack). Likely a one-line note under User company pack / opportunities.

## Open questions

None for v1 — resolved:

- Formula sides: output **Sell**, inputs **Buy** (listing / optimistic).  
- Scope: per-item, Companies page session, all companies.  
- Persistence: memory only until a later LS pass.
