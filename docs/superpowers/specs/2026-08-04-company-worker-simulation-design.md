# Company Worker Simulation — Design

**Date:** 2026-08-04  
**Status:** Approved for implementation  
**Depends on:** [Company Economy Advisor](./2026-07-31-company-economy-advisor-design.md), skills income / wage tax helpers  
**Inspired by:** [Arcana Era](https://arcana.warera.wiki/), [war-era.vercel.app/economy](https://war-era.vercel.app/economy)

## Goal

Expand the **Companies** page so each company card shows worker-aware profitability insights and supports interactive simulation (parameter overrides, simulated workers, deactivate/move) without leaving the scrollable list.

v1 prioritizes **data + workable controls** over visual polish. A later UX pass can refine density and presentation.

## Decisions

| Topic | Choice |
| --- | --- |
| Surface | Enrich existing company cards on the Companies list |
| Layout | Summary strip always visible; deeper info in sections |
| Default open section | Workers |
| Actions | Menus / modals (add sim worker, edit, deactivate, move) |
| Sim state | Session-only; store shaped for a future localStorage adapter |
| Cross-company moves | Yes — shared worker pool; assignment via state |
| Live worker data | Fetch richest API payload possible; values are defaults/reset; all overridable |
| Max suggested wage | Owner break-even at **0% fidelity** |
| Wage display | Always **gross (owner cost)** and **net (worker take-home)** |
| Fidelity projection | Current vs **10% max** (≈ +1%/day worked); no break-even-days |
| Company knobs | AE level, production bonus, entrepreneurship / self-work |
| Existing AE/switch advisor | Remains on the card (separate section) |

## Architecture

```
[WarEra API]
  worker.getWorkers (+ richer fields when present)
  workOffer / user lite / country income tax
  existing company pack (AE, bonus, item, prices)
        ↓
[Server] enrich advisor / pack with workers + incomeTaxRate
        ↓
[Web] CompanySimProvider  ← session state
        ├── workers[] (real + simulated; companyId | null)
        ├── companyOverrides[companyId]
        └── derived summaries via pure economy math
        ↓
[UI] CompanyCard summary + sections
     + modals/menus for mutations
```

### Boundaries

| Layer | Responsibility |
| --- | --- |
| `src/economy/` (worker math) | Pure functions: PP/day, costs, max wage @ 0% fid, fidelity scenarios, company totals |
| `CompanySimProvider` | Hydrate from live pack; hold overrides; dispatch actions; expose derived views |
| Company cards | Render only; no business math beyond formatting |
| Persistence adapter | Interface only in v1 (`get`/`set` in-memory); localStorage later |

Components re-render from shared state. Moving a worker updates `assignment`; cards for source and target both reflect the change.

## Data model

### Live defaults (API → reset baseline)

**Per company**

- id, name, itemCode, region, AE level, production bonus
- income tax rate (country of company region; reuse `parseIncomeTaxRate` path)
- work-offer wage/PP if available

**Per real worker**

- userId, username (if available), companyId
- wage/PP (gross)
- energy level + value, production level + value
- fidelity % (0–10)

Missing fields after fetch: documented default or editable blank, plus an “assumed” / incomplete badge. Exact API gaps are called out during implementation for follow-up research (including undocumented endpoints).

### Sim state (session)

```ts
type WorkerAssignment = string | null; // companyId | unassigned/deactivated

type SimWorker = {
  id: string; // userId or sim-*
  kind: "real" | "simulated";
  name: string;
  assignment: WorkerAssignment;
  wagePerPp: number;
  energyLevel: number;
  productionLevel: number;
  fidelityPct: number; // 0..10
  // overrides vs live snapshot tracked for Reset
};

type CompanyOverrides = {
  aeLevel?: number;
  productionBonus?: number; // fraction
  entrepreneurshipLevel?: number; // self-work contribution
  offerWagePerPp?: number;
};
```

- Overrides sit on top of live defaults.
- **Reset** (per company or per worker) restores that scope to the last live snapshot.
- Player Load/Refresh re-fetches live data and updates the baseline. Unsaved overrides are **kept** with a dirty badge (v1); no blocking confirm dialog.

### Simulated worker create (modal)

- Name (default e.g. `Sim Worker N`)
- Wage/PP
- Fidelity %
- Energy Lv dropdown labeled `Lv N – {value}`
- Production Lv dropdown labeled `Lv N – {value}`
- “Worker active from start” (assigns to current company if checked; else unassigned)

## Math

Reuse existing Profit/PP (market price − recipe inputs). Production bonus applies to AE, self-work, and employees.

### Worker PP / day

Derive work actions and PP per action from energy / production skill tables (same family as skills income math). Apply:

```
effectiveBonus = productionBonus  // company override or live
effectivePpPerDay = basePpPerDay × (1 + effectiveBonus) × (1 + fidelityPct/100)
```

Fidelity: **+1% per day worked, max 10%**. Projection compares **current fidelity** vs **10%** at the same wage; no days-to-break-even.

### Costs and contribution

```
ownerCostPerDay = effectivePpPerDay × grossWagePerPp
workerNetWagePerPp = grossWagePerPp × (1 − incomeTaxRate)
revenuePerDay     = effectivePpPerDay × profitPerPp
contributionPerDay = revenuePerDay − ownerCostPerDay
```

Owner pays full gross; tax reduces worker take-home (existing game rule).

### Max wage @ 0% fidelity

Owner break-even wage with fidelity forced to **0%**. When production bonus scales both revenue PP and wage PP equally:

```
contribution = effectivePpPerDay × (profitPerPp − grossWagePerPp)
maxGrossWagePerPp = profitPerPp   // daily contribution ≈ 0
```

If implementation discovers wage is charged on unboosted PP while output uses bonus (or the reverse), adjust the closed form and document it in code comments + tests. Rounding may yield tiny ± near zero — that is acceptable.

Always display this (and any wage) as **gross | net**.

### Company daily totals

```
total = AE daily value
      + self-work daily value (from entrepreneurship / energy as applicable)
      + Σ active workers’ contributions
```

Daily breakdown section lists: AE PP, worker PP, units produced, revenue, wage costs, input costs (market), net.

## UI (Companies page cards)

### Summary (always visible)

- Company name; material · region · AE · bonus
- Net profit / day (sim-aware)
- Active worker count
- Max wage @ 0% fid (gross | net)
- Current offer / representative wage (gross | net)
- Company net / day if all **active** workers on this card were at **10% fidelity** (AE + self-work unchanged) — “kept happy” headline

### Sections

| Section | Default | Contents |
| --- | --- | --- |
| Parameters | Closed | AE, bonus, entrepreneurship/self-work, Reset to live |
| Workers | **Open** | Rows + + Add simulated worker |
| Daily breakdown | Closed | P&L line items |
| Switch / AE advisor | As today (visible block) | Existing material/region recommendation — not forced into a closed disclosure |

### Worker row

- Name; Simulated badge when applicable; energy; fidelity
- Wage gross | net; daily cost; contribution now; contribution @ 10% fid
- ⋮ menu: Edit · Deactivate/Activate · Move to company… (modal)

### Page-level

Show a simple sum of per-company sim nets at the top or bottom of the company list (portfolio snapshot).

## Data flow

1. User selects player (existing shell Load/Refresh).
2. Server builds advisor pack + worker enrichment (per company, soft-fail independently).
3. Client hydrates `CompanySimProvider` from pack.
4. UI derives summaries; user mutates via actions.
5. Refresh updates live baseline; overrides retained with dirty badge.

## Errors

| Case | Behavior |
| --- | --- |
| Worker fetch fails for a company | Card shows “workers unavailable”; rest of advisor still works |
| Tax rate missing | Treat as 0%; muted note |
| Incomplete worker stats | Defaults + “assumed” badge; still editable |
| Unknown skill level in picker | Clamp to known table range |

## Testing

- Unit: max wage @ 0% fid; gross/net tax; contribution at 0% vs 10% fid; move/deactivate assignment; company totals (AE + self-work + workers)
- Provider/reducer: hydrate from pack; add sim worker; reset overrides
- No E2E required for v1

## Out of scope (v1)

- localStorage / save-load persistence (adapter seam only)
- Visual polish pass
- Internal raw supply at cost vs market (Arcana-style)
- Peer / market wage discovery for “attractive” offers
- Writing wages or job offers back to WarEra
- Day-by-day fidelity timeline chart
- Dedicated per-company detail route

## Files likely touched

- `src/economy/` — worker / wage / fidelity pure math + tests
- `src/warera/workers.ts` — richer parse + fetch
- `src/economy/advisor.ts` / `src/server/routes/economy.ts` / company pack — enrich with workers + tax
- `src/web/features/companies/` — provider, card sections, modals
- Skills tables for energy/production level labels (reuse existing)

## Open implementation note

Confirm which fields `worker.getWorkers` (and related user/skill calls) actually return. Prefer allowlisted documented APIs; if fidelity / energy / production are missing, stop and report gaps before inventing scrapers — undocumented endpoints only after user research.
