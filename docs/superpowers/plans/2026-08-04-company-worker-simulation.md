# Company Worker Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich Companies page cards with worker profitability insights (gross/net wages, max wage @ 0% fidelity, current vs 10% fidelity) and a session sim (overrides, simulated workers, deactivate/move) driven by shared state + pure economy math.

**Architecture:** Extend WarEra worker parsing and advisor enrichment on the server; add pure math in `src/economy/workers/`; lift a `CompanySimProvider` over the Companies list that hydrates from the advisor pack and derives per-company summaries. Cards render summary + sections; modals/menus mutate sim state only.

**Tech Stack:** TypeScript, Hono, Vitest via `vp test`, Vite+ (`vp check`), TanStack Query, React 19 (`use`), existing skills tables (`skillValueFromLevel`, `dailyActionsFromBar`).

**Design:** [2026-08-04-company-worker-simulation-design.md](../specs/2026-08-04-company-worker-simulation-design.md)

## Global Constraints

- Session-only sim state; persistence behind a tiny in-memory adapter interface (no localStorage in v1)
- Always show wages as gross (owner) | net (worker take-home)
- Max suggested wage = owner break-even at **0% fidelity** (`maxGrossWagePerPp = profitPerPp` when bonus scales both sides)
- Fidelity projection = current vs **10%** only (no break-even-days)
- Live API values are defaults/reset; all sim fields overridable
- Worker fetch soft-fails per company; tax missing → 0% with muted note
- Prefer allowlisted WarEra procedures; if energy/production/fidelity are missing from API, **stop and report gaps** before inventing scrapers
- Prefer `vp test path/to/file.test.ts` and `vp check` for verification
- Commit after each task
- UX is good-enough; polish is out of scope

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/economy/workers/wages.ts` | Gross/net tax split, max wage @ 0% fid |
| `src/economy/workers/worker-day.ts` | Worker PP/day + contribution at a fidelity |
| `src/economy/workers/company-day.ts` | Company totals: AE + self-work + workers + P&L lines |
| `src/economy/workers/index.ts` | Public exports |
| `src/economy/workers/*.test.ts` | Unit tests for math |
| `src/warera/workers.ts` | Richer `WorkerRow` parse (+ tests) |
| `src/skills/job-wage.ts` | Export shared `fetchIncomeTaxRateForCompany` |
| `src/economy/advisor.ts` | Attach `workers`, `incomeTaxRate`, `offerWagePerPp` per row |
| `src/web/features/companies/types.ts` | Mirror enriched advisor types |
| `src/web/features/companies/sim/types.ts` | Sim worker / overrides / live snapshot types |
| `src/web/features/companies/sim/persistence.ts` | `SimPersistence` interface + memory impl |
| `src/web/features/companies/sim/reducer.ts` | Hydrate + actions |
| `src/web/features/companies/sim/derive.ts` | Derive card summaries from state + advisor |
| `src/web/features/companies/sim/CompanySimProvider.tsx` | Context provider |
| `src/web/features/companies/CompanyCard*.tsx` | Split card UI (summary, sections, modals) |
| `src/web/features/companies/CompaniesPage.tsx` | Wrap provider; portfolio sum |

---

### Task 1: Wage helpers (gross/net + max wage)

**Files:**
- Create: `src/economy/workers/wages.ts`
- Create: `src/economy/workers/wages.test.ts`
- Create: `src/economy/workers/index.ts`

**Interfaces:**
- Consumes: none (pure)
- Produces:
  - `export function netWageFromGross(grossWagePerPp: number, incomeTaxRate: number): number`
  - `export function maxGrossWagePerPp(profitPerPp: number): number` — returns `profitPerPp` (break-even when bonus scales both sides)
  - `export type WagePair = { gross: number; net: number }`
  - `export function wagePair(gross: number, incomeTaxRate: number): WagePair`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vite-plus/test";
import { maxGrossWagePerPp, netWageFromGross, wagePair } from "./wages";

describe("netWageFromGross", () => {
  it("applies tax as fraction", () => {
    expect(netWageFromGross(0.135, 0.1)).toBeCloseTo(0.1215, 6);
  });

  it("treats tax 0 as identity", () => {
    expect(netWageFromGross(0.2, 0)).toBe(0.2);
  });
});

describe("maxGrossWagePerPp", () => {
  it("equals profit per PP at 0% fidelity break-even", () => {
    expect(maxGrossWagePerPp(0.134)).toBe(0.134);
  });
});

describe("wagePair", () => {
  it("returns gross and net", () => {
    expect(wagePair(1, 0.25)).toEqual({ gross: 1, net: 0.75 });
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `vp test src/economy/workers/wages.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
export type WagePair = { gross: number; net: number };

export function netWageFromGross(grossWagePerPp: number, incomeTaxRate: number): number {
  return grossWagePerPp * (1 - incomeTaxRate);
}

export function maxGrossWagePerPp(profitPerPp: number): number {
  return profitPerPp;
}

export function wagePair(gross: number, incomeTaxRate: number): WagePair {
  return { gross, net: netWageFromGross(gross, incomeTaxRate) };
}
```

`index.ts`:

```ts
export {
  maxGrossWagePerPp,
  netWageFromGross,
  wagePair,
  type WagePair,
} from "./wages";
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `vp test src/economy/workers/wages.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/economy/workers/wages.ts src/economy/workers/wages.test.ts src/economy/workers/index.ts
git commit -m "feat(economy): add worker wage gross/net and max-wage helpers"
```

---

### Task 2: Worker day math (PP + contribution + fidelity)

**Files:**
- Create: `src/economy/workers/worker-day.ts`
- Create: `src/economy/workers/worker-day.test.ts`
- Modify: `src/economy/workers/index.ts`

**Interfaces:**
- Consumes: `skillValueFromLevel` from `src/skills/values.ts`; `dailyActionsFromBar` from `src/skills/income.ts`
- Produces:
  - `export const MAX_FIDELITY_PCT = 10`
  - `export type WorkerDayInput = { energyLevel: number; productionLevel: number; productionBonus: number; fidelityPct: number; grossWagePerPp: number; profitPerPp: number }`
  - `export type WorkerDayResult = { actionsPerDay: number; ppPerAction: number; basePpPerDay: number; effectivePpPerDay: number; revenuePerDay: number; ownerCostPerDay: number; contributionPerDay: number }`
  - `export function workerDay(input: WorkerDayInput): WorkerDayResult`
  - `export function workerDayAtFidelity(input: Omit<WorkerDayInput, "fidelityPct">, fidelityPct: number): WorkerDayResult`

Formula:

```
actionsPerDay = dailyActionsFromBar(skillValueFromLevel("energy", energyLevel))
ppPerAction = skillValueFromLevel("production", productionLevel)
basePpPerDay = actionsPerDay * ppPerAction
effectivePpPerDay = basePpPerDay * (1 + productionBonus) * (1 + fidelityPct/100)
revenue = effectivePpPerDay * profitPerPp
cost = effectivePpPerDay * grossWagePerPp
contribution = revenue - cost
```

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vite-plus/test";
import { MAX_FIDELITY_PCT, workerDay, workerDayAtFidelity } from "./worker-day";
import { skillValueFromLevel } from "../../skills/values";
import { dailyActionsFromBar } from "../../skills/income";

describe("workerDay", () => {
  it("scales PP by bonus and fidelity", () => {
    const energyLevel = 5;
    const productionLevel = 5;
    const actions = dailyActionsFromBar(skillValueFromLevel("energy", energyLevel));
    const ppPerAction = skillValueFromLevel("production", productionLevel);
    const base = actions * ppPerAction;
    const r = workerDay({
      energyLevel,
      productionLevel,
      productionBonus: 0.605,
      fidelityPct: 0,
      grossWagePerPp: 0.135,
      profitPerPp: 0.134,
    });
    expect(r.effectivePpPerDay).toBeCloseTo(base * 1.605, 4);
    expect(r.contributionPerDay).toBeCloseTo(
      r.effectivePpPerDay * (0.134 - 0.135),
      4,
    );
  });

  it("projects higher contribution at max fidelity when wage below profit/PP", () => {
    const baseInput = {
      energyLevel: 5,
      productionLevel: 5,
      productionBonus: 0.5,
      grossWagePerPp: 0.1,
      profitPerPp: 0.2,
    };
    const now = workerDayAtFidelity(baseInput, 0);
    const max = workerDayAtFidelity(baseInput, MAX_FIDELITY_PCT);
    expect(max.contributionPerDay).toBeGreaterThan(now.contributionPerDay);
    expect(max.effectivePpPerDay / now.effectivePpPerDay).toBeCloseTo(1.1, 6);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/economy/workers/worker-day.test.ts`

- [ ] **Step 3: Implement `worker-day.ts` and export from `index.ts`**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/economy/workers/worker-day.ts src/economy/workers/worker-day.test.ts src/economy/workers/index.ts
git commit -m "feat(economy): add worker daily PP and fidelity contribution math"
```

---

### Task 3: Company day totals + P&L lines

**Files:**
- Create: `src/economy/workers/company-day.ts`
- Create: `src/economy/workers/company-day.test.ts`
- Modify: `src/economy/workers/index.ts`

**Interfaces:**
- Consumes: `aeDailyValue` / `explainAeDaily` from `src/economy/profit.ts`; `workerDay` / `workerDayAtFidelity` / `MAX_FIDELITY_PCT`; `dailyActionsFromBar`, `skillValueFromLevel`; `getRecipe` from `src/economy/recipes.ts` (for units = totalPp / consumedPp)
- Produces:
  - `export type CompanyDayWorker = { id: string; energyLevel: number; productionLevel: number; fidelityPct: number; grossWagePerPp: number }`
  - `export type CompanyDayInput = { aeLevel: number; productionBonus: number; profitPerPp: number; itemCode: string | null; inputCostPerUnit: number; entrepreneurshipLevel: number; productionSkillLevel: number; includeSelfWork: boolean; workers: CompanyDayWorker[] }`
  - `export type CompanyDayResult = { aeDailyValue: number; aeDailyPp: number; selfWorkDailyValue: number; selfWorkDailyPp: number; workers: Array<{ id: string; current: ReturnType<typeof workerDay>; atMaxFidelity: ReturnType<typeof workerDay> }>; workerWageCostPerDay: number; workerRevenuePerDay: number; totalPpPerDay: number; unitsProduced: number | null; revenuePerDay: number; inputCostPerDay: number; netPerDay: number; netPerDayAtMaxWorkerFidelity: number; maxGrossWagePerPp: number }`
  - `export function companyDay(input: CompanyDayInput): CompanyDayResult`

Self-work (when `includeSelfWork`):

```
selfActions = dailyActionsFromBar(skillValueFromLevel("entrepreneurship", entrepreneurshipLevel))
ppPerAction = skillValueFromLevel("production", productionSkillLevel)
selfPp = selfActions * ppPerAction * (1 + productionBonus)
selfValue = selfPp * profitPerPp
```

`netPerDayAtMaxWorkerFidelity` = same totals but each worker evaluated at `MAX_FIDELITY_PCT` (AE + self-work unchanged).

`maxGrossWagePerPp` = `maxGrossWagePerPp(profitPerPp)` from Task 1.

- [ ] **Step 1: Write failing tests** covering: AE-only company; one worker loss-making at 0% fid profitable at 10%; units null when no recipe; inputCostPerDay = units * inputCostPerUnit

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/economy/workers/company-day.test.ts`

- [ ] **Step 3: Implement + export**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/economy/workers/company-day.ts src/economy/workers/company-day.test.ts src/economy/workers/index.ts
git commit -m "feat(economy): add company daily totals with workers and self-work"
```

---

### Task 4: Richer worker parsing

**Files:**
- Modify: `src/warera/workers.ts`
- Modify: `src/warera/workers.test.ts`

**Interfaces:**
- Consumes: existing parse helpers
- Produces extended `WorkerRow`:

```ts
export type WorkerRow = {
  userId: string;
  username: string | null;
  wagePerPp: number | null;
  companyId: string | null;
  energyLevel: number | null;
  productionLevel: number | null;
  fidelityPct: number | null;
  assumedFields: string[]; // e.g. ["energyLevel"] when defaulted later — parser lists keys present vs missing
};
```

Parser should pick common key aliases (`username`, `userName`, `energyLevel`/`energy`, `productionLevel`/`production`, `fidelity`/`fidelityPct`/`fidelityBonus`). Do **not** invent values in the parser — leave nulls.

- [ ] **Step 1: Extend tests with a rich payload and a thin payload**

```ts
it("parses optional skill and fidelity fields when present", () => {
  expect(
    parseWorkers([
      {
        userId: "u1",
        username: "mortada",
        wagePerPp: 0.135,
        companyId: "c1",
        energyLevel: 5,
        productionLevel: 5,
        fidelityPct: 1,
      },
    ]),
  ).toEqual([
    {
      userId: "u1",
      username: "mortada",
      wagePerPp: 0.135,
      companyId: "c1",
      energyLevel: 5,
      productionLevel: 5,
      fidelityPct: 1,
      assumedFields: [],
    },
  ]);
});

it("leaves missing skill fields null", () => {
  const [row] = parseWorkers([{ userId: "u1", wagePerPp: 0.1 }]);
  expect(row?.energyLevel).toBeNull();
  expect(row?.username).toBeNull();
});
```

Update existing expectations to include new null fields.

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/warera/workers.test.ts`

- [ ] **Step 3: Implement parser updates**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Probe live shape (manual / logged fixture)**

In implementation notes or a one-off debug log behind existing logger when fetching workers for advisor: log keys of first worker object (debug level). If `energyLevel` / `productionLevel` / `fidelityPct` / `username` are always null after Task 5 wiring, **stop and report API gaps to the user** before adding undocumented endpoints. Do not block Tasks 5–12 — UI must work with defaults + “assumed” badges.

- [ ] **Step 6: Commit**

```bash
git add src/warera/workers.ts src/warera/workers.test.ts
git commit -m "feat(warera): parse optional worker skill and fidelity fields"
```

---

### Task 5: Export tax fetch + enrich advisor rows

**Files:**
- Modify: `src/skills/job-wage.ts` — export `fetchIncomeTaxRateForCompany` (rename/export existing private `fetchIncomeTaxRate`)
- Modify: `src/skills/job-wage.test.ts` if needed for export
- Modify: `src/economy/advisor.ts`
- Modify: `src/economy/advisor.test.ts` (or add worker enrichment tests)
- Modify: `src/web/features/companies/types.ts` to match API

**Interfaces:**
- Consumes: `fetchWorkers`, `fetchWorkOfferWage`, `fetchIncomeTaxRateForCompany`
- Produces on each `CompanyAdvisorRow`:

```ts
workers: AdvisorWorker[]; // may be []
workersStatus: "ok" | "unavailable";
incomeTaxRate: number; // 0 if missing
incomeTaxAssumed: boolean;
offerWagePerPp: number | null;
```

```ts
export type AdvisorWorker = {
  userId: string;
  username: string | null;
  wagePerPp: number | null;
  energyLevel: number | null;
  productionLevel: number | null;
  fidelityPct: number | null;
};
```

Per company in `buildAdvisor`, after building the row’s company id:

```ts
try {
  const [workers, offerWage, tax] = await Promise.all([
    fetchWorkers(warera, { companyId: company.id }),
    fetchWorkOfferWage(warera, company.id),
    fetchIncomeTaxRateForCompany(warera, company.id),
  ]);
  // map workers → AdvisorWorker; incomeTaxRate = tax; ...
} catch {
  workersStatus = "unavailable";
  workers = [];
  incomeTaxRate = 0;
  incomeTaxAssumed = true;
  offerWagePerPp = null;
}
```

Use `Promise.all` across companies only if rate limits allow; otherwise sequential per company is acceptable (document choice). Prefer bounded concurrency (e.g. chunks of 3) if many companies.

Mirror types in `src/web/features/companies/types.ts`.

- [ ] **Step 1: Write/adjust advisor tests with mocked warera.request** asserting workers attached and soft-fail path

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/economy/advisor.test.ts`

- [ ] **Step 3: Implement export + enrichment + client types**

- [ ] **Step 4: Run advisor + workers + job-wage tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/skills/job-wage.ts src/skills/job-wage.test.ts src/economy/advisor.ts src/economy/advisor.test.ts src/web/features/companies/types.ts
git commit -m "feat(economy): enrich advisor with workers, tax rate, and offer wage"
```

---

### Task 6: Sim types, persistence adapter, reducer

**Files:**
- Create: `src/web/features/companies/sim/types.ts`
- Create: `src/web/features/companies/sim/persistence.ts`
- Create: `src/web/features/companies/sim/reducer.ts`
- Create: `src/web/features/companies/sim/reducer.test.ts`

**Interfaces:**
- Produces:

```ts
// types.ts
export type SimWorker = {
  id: string;
  kind: "real" | "simulated";
  name: string;
  assignment: string | null;
  wagePerPp: number;
  energyLevel: number;
  productionLevel: number;
  fidelityPct: number;
  assumedFields: string[];
  dirty: boolean;
};

export type CompanyOverrides = {
  aeLevel?: number;
  productionBonus?: number;
  entrepreneurshipLevel?: number;
  productionSkillLevel?: number;
  offerWagePerPp?: number;
  includeSelfWork?: boolean;
};

export type CompanySimState = {
  workers: SimWorker[];
  overrides: Record<string, CompanyOverrides>;
  liveEpoch: number; // bumps on hydrate from fresh advisor
};

export type CompanySimAction =
  | { type: "hydrate"; live: HydratePayload; keepOverrides: boolean }
  | { type: "setCompanyOverride"; companyId: string; patch: CompanyOverrides }
  | { type: "resetCompany"; companyId: string; live: HydratePayload }
  | { type: "addSimWorker"; worker: SimWorker }
  | { type: "updateWorker"; id: string; patch: Partial<SimWorker> }
  | { type: "setAssignment"; id: string; assignment: string | null }
  | { type: "removeSimWorker"; id: string };
```

Defaults when hydrating real workers with nulls: `energyLevel: 5`, `productionLevel: 5`, `fidelityPct: 0`, `wagePerPp: offer or 0`, name = username ?? userId; push field names into `assumedFields`.

`SimPersistence`: `{ load(): CompanySimState | null; save(state: CompanySimState): void }` — memory no-op load/save for v1 (save may be unused; keep interface).

Reducer tests: hydrate → add sim → move worker between companies → deactivate (`assignment: null`) → reset company clears overrides and restores real workers for that company from live payload.

- [ ] **Step 1: Write failing reducer tests**

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/web/features/companies/sim/reducer.test.ts`

- [ ] **Step 3: Implement types, persistence, reducer**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/web/features/companies/sim/
git commit -m "feat(web): add company sim reducer and persistence adapter seam"
```

---

### Task 7: Derive card summaries

**Files:**
- Create: `src/web/features/companies/sim/derive.ts`
- Create: `src/web/features/companies/sim/derive.test.ts`

**Interfaces:**
- Consumes: `companyDay`, advisor row fields, `CompanySimState`
- Produces:

```ts
export type DerivedCompanyCard = {
  companyId: string;
  dirty: boolean;
  workersStatus: "ok" | "unavailable";
  incomeTaxRate: number;
  incomeTaxAssumed: boolean;
  activeWorkerCount: number;
  day: ReturnType<typeof companyDay>; // or CompanyDayResult
  offerWage: WagePair | null;
  maxWage: WagePair;
};

export function deriveCompanyCard(
  row: CompanyAdvisorRow,
  state: CompanySimState,
  ownerDefaults: { entrepreneurshipLevel: number; productionSkillLevel: number },
): DerivedCompanyCard;

export function derivePortfolioNet(cards: DerivedCompanyCard[]): number;
```

Resolve effective AE/bonus/entre from `overrides[id]` ?? live row / ownerDefaults. Active workers = `state.workers` where `assignment === companyId`.

- [ ] **Step 1: Write failing derive tests** (move worker changes which card gets their cost; @10% net differs)

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/web/features/companies/sim/derive.test.ts`

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/web/features/companies/sim/derive.ts src/web/features/companies/sim/derive.test.ts
git commit -m "feat(web): derive company card summaries from sim state"
```

---

### Task 8: Provider + page portfolio sum + card summary shell

**Files:**
- Create: `src/web/features/companies/sim/CompanySimProvider.tsx`
- Create: `src/web/features/companies/CompanyCardSummary.tsx` (or inline in card first)
- Modify: `src/web/features/companies/CompaniesPage.tsx`
- Modify: optionally use `useUserQuery` for owner entrepreneurship/production levels

**Interfaces:**
- Produces context: `{ state, dispatch, cards: DerivedCompanyCard[], portfolioNet: number }`
- Hydrate when advisor data arrives; `keepOverrides: true` on refresh
- Show dirty badge on card when overrides/workers dirty
- Portfolio net above or below the company list

Card summary (always visible), matching design:

- Name, material · region · AE · bonus
- Net /day (`day.netPerDay`)
- Active workers count
- Max wage @0% fid gross|net
- Offer wage gross|net (from override or live offer)
- Net @10% worker fidelity (`day.netPerDayAtMaxWorkerFidelity`)

Keep existing AE formulas + best-switch block on the card.

Use native `<details>` for Parameters / Workers / Daily breakdown placeholders (Workers default `open`).

- [ ] **Step 1: Wire provider + summary fields (no modals yet)**

- [ ] **Step 2: Manual smoke** — `vp run dev`, load a player with companies; confirm summary numbers render (zeros/assumed OK)

- [ ] **Step 3: `vp check` on touched files / project**

- [ ] **Step 4: Commit**

```bash
git add src/web/features/companies/
git commit -m "feat(web): wire CompanySimProvider and card summary strip"
```

---

### Task 9: Workers section + add / edit / move / deactivate

**Files:**
- Create: `src/web/features/companies/SimWorkerModal.tsx` (create + edit via props)
- Create: `src/web/features/companies/MoveWorkerModal.tsx`
- Create: `src/web/features/companies/WorkerRowActions.tsx`
- Modify: company card Workers `<details>`

**UI requirements:**
- Worker row: name, Simulated badge, energy, fidelity, wage gross|net, daily cost, contrib now, contrib @10%, ⋮ menu
- ⋮: Edit · Deactivate/Activate · Move to…
- + Add simulated worker → modal with: name, wage, fidelity, Energy `Lv N – {value}`, Production `Lv N – {value}`, active from start
- Level options: levels 0..20 (or 0..15) using `skillValueFromLevel` for labels
- Move modal: select target company id from advisor list (or Unassigned)

- [ ] **Step 1: Implement modals with native `<dialog>` + form controls (Input/Label/Button existing)**

- [ ] **Step 2: Wire actions to `dispatch`

- [ ] **Step 3: Manual smoke — add sim worker, move to another company, deactivate; portfolio/card nets update

- [ ] **Step 4: Commit**

```bash
git add src/web/features/companies/
git commit -m "feat(web): add simulated workers and move/deactivate actions"
```

---

### Task 10: Parameters + daily breakdown sections

**Files:**
- Modify: company card Parameters / Daily breakdown `<details>`
- Create: `src/web/features/companies/CompanyParametersForm.tsx` if file size warrants

**Parameters:** AE level select 1–7, bonus % input, entrepreneurship level, production skill level (for self-work PP/action), include self-work checkbox, Reset company button (`resetCompany`).

**Daily breakdown:** list AE PP/value, self-work, worker PP, units, revenue, wage costs, input costs, net — use `day` fields; muted note if `incomeTaxAssumed` or worker `assumedFields`.

- [ ] **Step 1: Implement forms bound to overrides**

- [ ] **Step 2: Manual smoke — tweak AE/bonus; reset restores live**

- [ ] **Step 3: Run full related tests + `vp check`**

```bash
vp test src/economy/workers/ src/web/features/companies/sim/ src/warera/workers.test.ts src/economy/advisor.test.ts
vp check
```

- [ ] **Step 4: Commit**

```bash
git add src/web/features/companies/ src/economy/workers/
git commit -m "feat(web): add company sim parameters and daily breakdown sections"
```

---

## Spec coverage checklist

| Spec item | Task |
| --- | --- |
| Gross/net wage display helpers | 1, 8–9 |
| Max wage @ 0% fidelity | 1, 3, 7–8 |
| Worker PP + contribution; 0% vs 10% fid | 2, 7–9 |
| Company totals AE + self-work + workers | 3, 7 |
| Rich worker fetch / parse; gaps reported | 4–5 |
| Advisor enrichment + soft-fail | 5 |
| Session sim + persistence seam | 6 |
| Move / deactivate / add simulated | 6, 9 |
| Card summary + sections layout | 8–10 |
| Portfolio net sum | 7–8 |
| Overrides + reset | 6, 10 |
| Out of scope (localStorage, polish, write-back) | Not scheduled |

## Execution handoff

After this plan is saved, choose an execution mode (see agent prompt after save).
