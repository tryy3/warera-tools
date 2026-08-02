# Factory Growth Planner — Design

**Date:** 2026-08-02  
**Status:** Approved for implementation  
**Depends on:** [Company Economy Advisor](./2026-07-31-company-economy-advisor-design.md) (company packs, prices, Profit/PP, AE daily value)  
**Inspired by:** [3dcut/warera-company-calc](https://github.com/3Dcut/warera-company-calc) ([live](https://3dcut.github.io/warera-company-calc/?lang=en))

## Goal

Help players explore **how to grow passive AE income** toward a milestone (e.g. 6×AE7 or 12×AE7): compare paths, see time-to-goal on a production curve, and get a concrete next-step buy/upgrade log.

This tool answers **upgrade/buy sequencing**. It does **not** replace Companies (what to produce / whether to switch material or region).

## Decisions

| Topic | Choice |
| --- | --- |
| Primary UX | Same skeleton as 3dcut: controls/paths → full-width curve → step log → factory list |
| Goal | Single end goal: **N companies at AE7** (N = 1…12) |
| Paths (v1) | **Optimal** and **Upgrades-only** |
| Optimal | May buy companies beyond N (income accelerators); hard cap **12** |
| Upgrades-only | May buy only up to N (`maxCompanies = max(currentCount, N)`); never beyond N |
| Active skills / slots | **Ignored in v1** — every owned company earns AE income (player may temporarily put skills into companies) |
| Side income | Single editable **extra G/day** (no named mission/case/worker toggles) |
| Player data | Same player picker pattern as Companies; override most parameters |
| New company income | Default **best Profit/PP** item; user may pick another item + bonus override |
| Existing company income | Keep each company’s bootstrapped G/AE/day from current item + bonus |
| New company cost | **Linear:** company `#k` costs `k × 50` Concrete (1st=50, 2nd=100, …). Wiki “100 flat” is **incorrect** |
| AE upgrade cost | Wiki Steel table: L1→L2=20, …, L6→L7=640 |
| Max AE / companies | AE7 and 12 companies (game hard limits) |
| Computation | **Client-side** pure planner; API only boots a lean snapshot |
| Chart | TanStack Charts; overlay both paths (G/day vs time) |
| Storage / sell / retask | Out of scope for the sim |
| Eco / Sustain presets | Out of scope for v1 (may return later with richer income models) |

## Architecture

```
[Player search] --> GET /api/economy/search          (reuse)

[Growth page]  --> GET /api/growth/bootstrap?userId=
                        lean snapshot (not full advisor)
                        |
                        v
               [src/growth/* pure planner]  (browser)
                        |
         Optimal path + Upgrades-only path
                        |
        TanStack curve + step log + factory list
```

- Reuse company-pack caching and price snapshots from the advisor path so we do not double-fetch unnecessarily.
- Optional `refresh=1` on bootstrap matches Companies semantics.
- Planner stays unit-testable without the network.

## Routes & navigation

| Label | Path | Purpose |
| --- | --- | --- |
| Growth | `/growth` | Factory growth planner |

Place in shell nav beside Companies / Market. Exact label (“Growth” vs “Factory planner”) can match existing nav tone during implementation.

## Bootstrap API

`GET /api/growth/bootstrap?userId=&refresh=`

Returns **only** fields the client planner needs — no switch recommendations, payback tables, or full advisor rows.

| Field | Notes |
| --- | --- |
| `companies[]` | `id`, `name`, `aeLevel`, `itemCode`, `productionBonus`, `goldPerAePerDay` |
| `prices` | At least `steel`, `concrete`; enough to recompute selected item Profit/PP if needed |
| `bestItem` | `itemCode`, `profitPerPp`, `suggestedBonus` (default assumption for new companies) |
| `opportunitiesLite[]` | `itemCode`, `profitPerPp` for the item override control |
| `startBalance` / `steel` / `concrete` | Default `0` unless a reliable public field is found later; UI always overridable |
| `recordedAt` / `companiesFetchedAt` | Freshness metadata |

### Why not reuse `/api/economy/advisor` as-is?

Advisor payloads include switch/payback work the growth page does not need. A dedicated bootstrap keeps the response small and stable for the planner. Shared helpers (company pack load, opportunity ranking) should be factored rather than duplicated.

## Planner model

### Income

```
dailyGold = Σ (aeLevel_i × goldPerAePerDay_i) + extraGoldPerDay
hourlyGold = dailyGold / 24
```

- Existing factories: `goldPerAePerDay` from bootstrap (current item + bonus).
- New factories: from selected item Profit/PP and bonus:
  `goldPerAePerDay = profitPerPp × (1 + bonus) × 24`  
  (equivalent to AE daily value at level 1, scaled by AE level in the sum above).

Prices are **fixed** for the duration of a simulation (latest snapshot).

### Costs

| Action | Material | Gold |
| --- | --- | --- |
| Buy company `#k` | `k × 50` Concrete | inventory Concrete first, remainder × concrete market price |
| Upgrade AE `L → L+1` | Steel from table (`20 × 2^(L-1)` for L≥1→2) | inventory Steel first, remainder × steel market price |

No storage upgrades, no company destruction/sale, no mid-plan retask/relocate.

### Search

- **State key:** sorted multiset of AE levels.
- **Actions:** upgrade any company with AE &lt; 7; buy if `count < maxCompanies`.
- **Optimal:** `maxCompanies = 12`.
- **Upgrades-only:** `maxCompanies = max(currentCount, N)`.
- **Edge cost:** hours until the action is affordable (0 if current liquid covers it after applying income wait).
- **Goal:** count of companies with AE = 7 is **≥ N**.
- **Algorithm:** time-minimizing Dijkstra (or equivalent), inspired by 3dcut; iteration cap; treat as stuck if income ≤ 0 and no affordable action.

### Outputs per path

- Time series: `{ tHours, dailyGold }[]` for the chart (step changes at buy/upgrade events).
- Step list: action, absolute/relative time, Δ daily gold, cost breakdown.
- Summary: time-to-goal, final daily gold, whether complete / stuck / hit iter limit.

## UI

Layout (top → bottom), matching 3dcut:

1. **Controls** — player picker; goal N; path comparison cards (time-to-goal); overrides (balance, steel, concrete, extra G/day, new-item, bonus, cost bases if exposed).
2. **Chart** — full width; both paths as series; marker at goal completion; optional markers when AE7-count reaches 1…N along a path.
3. **Step log** — focused path’s buy/upgrade guide (changelog style).
4. **Factories** — current list; editable levels / remove for what-if scenarios.

Default focused path = faster complete path; clicking the other comparison card switches the step log.

Client state: selected user + overrides in URL and/or `localStorage`; recompute on change (debounce if needed for heavy runs).

## Modules (suggested)

| Area | Location |
| --- | --- |
| Cost tables & income helpers | `src/growth/` (pure TS) |
| Path search | `src/growth/plan.ts` (or similar) |
| Bootstrap builder | `src/growth/bootstrap.ts` + `src/server/routes/growth.ts` |
| Web UI | `src/web/features/growth/` + `src/web/routes/growth.tsx` |
| Shared economy math | Reuse `src/economy/profit.ts` / recipes — do not fork Profit/PP |

## Testing

- Unit: Concrete buy curve, Steel upgrade costs, inventory-before-market spend, goal detection, small fixtures for Optimal vs Upgrades-only (including “buy beyond N helps Optimal”).
- Bootstrap route: shape + does not require full advisor switch payload.
- No E2E requirement for v1 planner math.

## Error / edge cases

| Case | Behavior |
| --- | --- |
| Already ≥ N at AE7 | Empty plan, complete immediately |
| Stuck (no income, can’t afford) | Mark path incomplete; show last reachable state |
| Iteration cap | Incomplete + warning |
| Missing prices | Block plan with clear message; still show loaded companies |
| User has more than N companies already | Upgrades-only never buys; upgrades existing until ≥ N are AE7 |

## Out of scope (later)

- Eco / Sustain income packs and skill-slot modeling
- Named toggles for missions / cases / donations / workers
- Heuristic strategy overlays (cheapest-first, buy-first, etc.) beyond the two paths
- Storage upgrade planning
- Selling or downgrading companies mid-path
- Live balance/inventory auto-sync (until a reliable public API field exists)
- Material/region switch advice (stays on Companies)

## Mechanics note

Update [companies.md](../../../.agents/skills/warera-game-mechanics/companies.md) during implementation: extra company cost is **`k × 50` Concrete**, not a flat 100. Prefer live verification over the wiki for this rule.
