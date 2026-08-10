# Companies Portfolio Allocation & Recommended Sell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/companies`, allocate portfolio materials across companies (waterfall, free internal transfer), show Actual vs If-sold profit, enrich AE/worker rows with wage+input daily cost and recommended sell.

**Architecture:** Keep existing `companyDay` / `deriveCompanyCard` as pass 1 (production + wages). Add pure `allocatePortfolio` (pass 2) and `enrichProducerRows` (pass 3) under `src/economy/portfolio/`. Wire through `CompanySimProvider` + Companies UI (layout A). Market opportunities unchanged.

**Tech Stack:** Existing `src/economy/` math, Vitest via `vp test`, React Companies sim provider, session `BookPrices`.

**Spec:** [../specs/2026-08-10-companies-portfolio-allocation-recommended-sell-design.md](../specs/2026-08-10-companies-portfolio-allocation-recommended-sell-design.md)

## Global Constraints

- Internal transfer price = **0**; shortfall at session **buy**; surplus at session **sell**.
- Waterfall order = **advisor/card list order** (producers and consumers).
- Supply = full company output (AE + workers + self-work if enabled).
- Dual profit on **company card + portfolio**; rows show Actual-attributed **Profit now** only.
- Rec. sell on producer rows only (not Market opportunities).
- `RECOMMENDED_SELL_EPS = 0.001`.
- Self-work: included in `unitsOut` / allocation; **no** separate worker-list row in v1.
- Tests: `vp test <path>` (or `node_modules/.bin/vp test <path>`).

## File map

| File | Responsibility |
| --- | --- |
| `src/economy/portfolio/types.ts` | Snapshot + allocation + row result types |
| `src/economy/portfolio/allocate.ts` | Waterfall allocator + company/portfolio P&L |
| `src/economy/portfolio/allocate.test.ts` | Spec table cases |
| `src/economy/portfolio/enrichRows.ts` | Pro-rata AE/worker rows, dailyCost, rec. sell |
| `src/economy/portfolio/enrichRows.test.ts` | Row math |
| `src/economy/portfolio/index.ts` | Public exports |
| `src/web/features/companies/sim/derive.ts` | Build portfolio snapshots from cards; attach allocation |
| `src/web/features/companies/sim/derive.test.ts` | Integration with fake iron/steel cards |
| `src/web/features/companies/sim/CompanySimProvider.tsx` | Run allocate+enrich; expose portfolio Actual/If sold |
| `src/web/features/companies/CompanyCardSummary.tsx` | Compact Actual / If sold header |
| `src/web/features/companies/CompaniesPage.tsx` | Portfolio banner; AE row; worker cost/rec. sell |
| Spec status line | Mark Implemented when done (last task) |

---

### Task 1: Portfolio types + `allocatePortfolio` (iron → steel shortfall)

**Files:**
- Create: `src/economy/portfolio/types.ts`
- Create: `src/economy/portfolio/allocate.ts`
- Create: `src/economy/portfolio/allocate.test.ts`
- Create: `src/economy/portfolio/index.ts`

**Interfaces:**
- Consumes: `BookPrices` from `src/economy/profit.ts`; `getRecipe` only in derive later (allocator takes precomputed demand)
- Produces:
  - `PortfolioCompanyInput`
  - `allocatePortfolio(companies, book): PortfolioAllocation`
  - `PortfolioAllocation.byCompanyId[id].{ transferredOut, soldOut, marketBoughtByInput, marketBuyCash, sellRevenueActual, effectiveInputCostPerUnit, wageCostPerDay, actualProfit, markToMarketProfit }`
  - `PortfolioAllocation.portfolio.{ actualProfit, markToMarketProfit }`

- [ ] **Step 1: Write failing test — iron 300 / steel needs 500**

Create `allocate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { allocatePortfolio } from "./allocate";
import type { PortfolioCompanyInput } from "./types";

const book = {
  buy: { iron: 0.05, steel: 0.8 },
  sell: { iron: 0.06, steel: 1.0 },
};

function co(partial: Partial<PortfolioCompanyInput> & Pick<PortfolioCompanyInput, "companyId" | "itemCode">): PortfolioCompanyInput {
  return {
    unitsOut: 0,
    wageCostPerDay: 0,
    inputDemand: {},
    ...partial,
  };
}

describe("allocatePortfolio", () => {
  it("gives steel free internal iron and markets the shortfall", () => {
    const companies: PortfolioCompanyInput[] = [
      co({ companyId: "iron-1", itemCode: "iron", unitsOut: 300, wageCostPerDay: 10, inputDemand: {} }),
      co({
        companyId: "steel-1",
        itemCode: "steel",
        unitsOut: 50, // 50 × 10 iron = 500 demand
        wageCostPerDay: 20,
        inputDemand: { iron: 500 },
      }),
    ];
    const r = allocatePortfolio(companies, book);
    const iron = r.byCompanyId["iron-1"]!;
    const steel = r.byCompanyId["steel-1"]!;

    expect(iron.transferredOut).toBeCloseTo(300);
    expect(iron.soldOut).toBeCloseTo(0);
    expect(iron.sellRevenueActual).toBeCloseTo(0);
    expect(iron.actualProfit).toBeCloseTo(-10); // wages only

    expect(steel.marketBoughtByInput.iron).toBeCloseTo(200);
    expect(steel.marketBuyCash).toBeCloseTo(200 * 0.05);
    expect(steel.effectiveInputCostPerUnit).toBeCloseTo((200 * 0.05) / 50);
    expect(steel.sellRevenueActual).toBeCloseTo(50 * 1.0);
    expect(steel.actualProfit).toBeCloseTo(50 * 1.0 - 20 - 200 * 0.05);

    expect(steel.markToMarketProfit).toBeCloseTo(50 * 1.0 - 20 - 500 * 0.05);
    expect(iron.markToMarketProfit).toBeCloseTo(300 * 0.06 - 10);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

Run: `vp test src/economy/portfolio/allocate.test.ts`  
Expected: fail (module / function missing).

- [ ] **Step 3: Implement types + allocator**

`types.ts`:

```ts
export type PortfolioCompanyInput = {
  companyId: string;
  itemCode: string | null;
  unitsOut: number;
  wageCostPerDay: number;
  /** Gross recipe demand: input itemCode → units needed per day */
  inputDemand: Record<string, number>;
};

export type CompanyAllocation = {
  transferredOut: number;
  soldOut: number;
  marketBoughtByInput: Record<string, number>;
  marketBuyCash: number;
  sellRevenueActual: number;
  effectiveInputCostPerUnit: number;
  wageCostPerDay: number;
  actualProfit: number;
  markToMarketProfit: number;
};

export type PortfolioAllocation = {
  byCompanyId: Record<string, CompanyAllocation>;
  portfolio: { actualProfit: number; markToMarketProfit: number };
};
```

`allocate.ts` algorithm (exact behavior):

1. Init per company: `remainingOut = unitsOut` (0 if `itemCode == null` or `!Number.isFinite(unitsOut)`), empty buys, `wageCostPerDay` copied.
2. Collect every item code in any `itemCode` or `inputDemand` key.
3. For each item `I` (any stable order, e.g. sorted keys — allocation result must not depend on item iteration order for independent items):
   - `supply`: list of `{ companyId, remaining }` for companies with `itemCode === I`, **in companies array order**, `remaining = remainingOut`.
   - For each company in **array order** with `need = inputDemand[I] ?? 0` and `need > 0`:
     - Walk supply in order; transfer `take = min(need, supply.remaining)`; reduce both; record transfers on producer (`transferredOut += take`, `remainingOut -= take`).
     - If `need > 0` left: `marketBoughtByInput[I] += need` on consumer.
   - After all consumers: each producer’s leftover `remainingOut` for this item is `soldOut` (set `soldOut = remainingOut` for producers of `I`; they only produce one item so this is final).
4. Prices: `buy(I)` / `sell(out)`. If shortfall `> 0` and buy missing/NaN → treat `marketBuyCash` / profits as `NaN`. If `soldOut > 0` and sell missing → `sellRevenueActual` / profits `NaN`.
5. Per company:
   - `marketBuyCash = Σ unitsBought[i] * buy(i)`
   - `sellRevenueActual = soldOut * sell(itemCode)` (0 if no item / soldOut 0)
   - `effectiveInputCostPerUnit = unitsOut > 0 ? marketBuyCash / unitsOut : 0`
   - `actualProfit = sellRevenueActual - wageCostPerDay - marketBuyCash`
   - `markToMarketProfit = unitsOut * sell(out) - wageCostPerDay - Σ demand[i]*buy(i)` (NaN if any required price missing)
6. Portfolio sums finite company profits (if any NaN, portfolio that side is NaN).

Export from `index.ts`.

- [ ] **Step 4: Run test — expect pass**

Run: `vp test src/economy/portfolio/allocate.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/economy/portfolio/
git commit -m "$(cat <<'EOF'
feat(economy): portfolio material waterfall allocator

Allocate company outputs to recipe demand in card order; price shortfalls at buy and surplus at sell.
EOF
)"
```

---

### Task 2: Allocator edge cases

**Files:**
- Modify: `src/economy/portfolio/allocate.test.ts`
- Modify: `src/economy/portfolio/allocate.ts` (only if tests reveal bugs)

**Interfaces:**
- Consumes: `allocatePortfolio` from Task 1
- Produces: same API; proven for two-supplier waterfall, surplus, no consumers, missing buy

- [ ] **Step 1: Add failing tests**

```ts
it("waterfalls two iron companies into one steel in card order", () => {
  const companies: PortfolioCompanyInput[] = [
    co({ companyId: "iron-a", itemCode: "iron", unitsOut: 100, wageCostPerDay: 1, inputDemand: {} }),
    co({ companyId: "iron-b", itemCode: "iron", unitsOut: 100, wageCostPerDay: 1, inputDemand: {} }),
    co({
      companyId: "steel-1",
      itemCode: "steel",
      unitsOut: 25, // needs 250 iron
      wageCostPerDay: 5,
      inputDemand: { iron: 250 },
    }),
  ];
  const r = allocatePortfolio(companies, book);
  expect(r.byCompanyId["iron-a"]!.transferredOut).toBeCloseTo(100);
  expect(r.byCompanyId["iron-a"]!.soldOut).toBeCloseTo(0);
  expect(r.byCompanyId["iron-b"]!.transferredOut).toBeCloseTo(100);
  expect(r.byCompanyId["iron-b"]!.soldOut).toBeCloseTo(0);
  expect(r.byCompanyId["steel-1"]!.marketBoughtByInput.iron).toBeCloseTo(50);
});

it("sells surplus iron at sell price", () => {
  const companies: PortfolioCompanyInput[] = [
    co({ companyId: "iron-1", itemCode: "iron", unitsOut: 400, wageCostPerDay: 10, inputDemand: {} }),
    co({
      companyId: "steel-1",
      itemCode: "steel",
      unitsOut: 10, // needs 100 iron
      wageCostPerDay: 5,
      inputDemand: { iron: 100 },
    }),
  ];
  const r = allocatePortfolio(companies, book);
  expect(r.byCompanyId["iron-1"]!.transferredOut).toBeCloseTo(100);
  expect(r.byCompanyId["iron-1"]!.soldOut).toBeCloseTo(300);
  expect(r.byCompanyId["iron-1"]!.sellRevenueActual).toBeCloseTo(300 * 0.06);
  expect(r.byCompanyId["iron-1"]!.actualProfit).toBeCloseTo(300 * 0.06 - 10);
});

it("matches mark-to-market when there are no consumers", () => {
  const companies: PortfolioCompanyInput[] = [
    co({ companyId: "iron-1", itemCode: "iron", unitsOut: 100, wageCostPerDay: 4, inputDemand: {} }),
  ];
  const r = allocatePortfolio(companies, book);
  const iron = r.byCompanyId["iron-1"]!;
  expect(iron.soldOut).toBeCloseTo(100);
  expect(iron.actualProfit).toBeCloseTo(iron.markToMarketProfit);
});

it("uses session buy override for shortfall cash", () => {
  const companies: PortfolioCompanyInput[] = [
    co({ companyId: "iron-1", itemCode: "iron", unitsOut: 0, wageCostPerDay: 0, inputDemand: {} }),
    co({
      companyId: "steel-1",
      itemCode: "steel",
      unitsOut: 10,
      wageCostPerDay: 0,
      inputDemand: { iron: 100 },
    }),
  ];
  const overridden = { buy: { ...book.buy, iron: 0.09 }, sell: book.sell };
  const r = allocatePortfolio(companies, overridden);
  expect(r.byCompanyId["steel-1"]!.marketBuyCash).toBeCloseTo(100 * 0.09);
});
```

- [ ] **Step 2: Run tests — fix until green**

Run: `vp test src/economy/portfolio/allocate.test.ts`  
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/economy/portfolio/allocate.ts src/economy/portfolio/allocate.test.ts
git commit -m "$(cat <<'EOF'
test(economy): cover portfolio allocator waterfall edge cases
EOF
)"
```

---

### Task 3: `enrichProducerRows` + recommended sell

**Files:**
- Create: `src/economy/portfolio/enrichRows.ts`
- Create: `src/economy/portfolio/enrichRows.test.ts`
- Modify: `src/economy/portfolio/index.ts`

**Interfaces:**
- Consumes: `CompanyAllocation` from Task 1
- Produces:
  - `RECOMMENDED_SELL_EPS = 0.001`
  - `recommendedSell(dailyCost, rowUnits): number | null`
  - `enrichProducerRows(input): EnrichedProducerRow[]`
  - `EnrichedProducerRow = { kind: "ae" | "worker" | "selfWork"; id: string; rowUnits: number; wageCost: number; dailyCost: number; profitNow: number; recommendedSell: number | null }`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { enrichProducerRows, recommendedSell, RECOMMENDED_SELL_EPS } from "./enrichRows";
import type { CompanyAllocation } from "./types";

const allocation: CompanyAllocation = {
  transferredOut: 0,
  soldOut: 80,
  marketBoughtByInput: {},
  marketBuyCash: 40,
  sellRevenueActual: 80,
  effectiveInputCostPerUnit: 0.5, // 40/80
  wageCostPerDay: 10,
  actualProfit: 30,
  markToMarketProfit: 30,
};

describe("recommendedSell", () => {
  it("returns null when units are 0", () => {
    expect(recommendedSell(10, 0)).toBeNull();
  });
  it("adds eps above break-even", () => {
    expect(recommendedSell(10, 100)).toBeCloseTo(10 / 100 + RECOMMENDED_SELL_EPS);
  });
});

describe("enrichProducerRows", () => {
  it("splits sold revenue and input cost pro-rata by units", () => {
    const rows = enrichProducerRows({
      unitsOut: 80,
      sellPrice: 1,
      allocation,
      ae: { id: "ae", rowUnits: 48, wageCost: 0 },
      workers: [{ id: "w1", rowUnits: 32, wageCost: 10 }],
    });
    const ae = rows.find((r) => r.kind === "ae")!;
    const w = rows.find((r) => r.kind === "worker")!;
    expect(ae.dailyCost).toBeCloseTo(48 * 0.5);
    expect(ae.profitNow).toBeCloseTo((48 / 80) * 80 * 1 - 48 * 0.5);
    expect(w.dailyCost).toBeCloseTo(10 + 32 * 0.5);
    expect(w.profitNow).toBeCloseTo((32 / 80) * 80 * 1 - (10 + 32 * 0.5));
    expect(w.recommendedSell).toBeCloseTo(w.dailyCost / 32 + RECOMMENDED_SELL_EPS);
  });

  it("shows negative profit when everything is transferred away", () => {
    const transferred: CompanyAllocation = {
      ...allocation,
      soldOut: 0,
      sellRevenueActual: 0,
      actualProfit: -50,
    };
    const rows = enrichProducerRows({
      unitsOut: 80,
      sellPrice: 1,
      allocation: transferred,
      ae: { id: "ae", rowUnits: 80, wageCost: 0 },
      workers: [],
    });
    expect(rows[0]!.profitNow).toBeCloseTo(-80 * 0.5);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `vp test src/economy/portfolio/enrichRows.test.ts`

- [ ] **Step 3: Implement**

```ts
export const RECOMMENDED_SELL_EPS = 0.001;

export function recommendedSell(dailyCost: number, rowUnits: number): number | null {
  if (!(rowUnits > 0) || !Number.isFinite(dailyCost)) return null;
  return dailyCost / rowUnits + RECOMMENDED_SELL_EPS;
}

export function enrichProducerRows(input: {
  unitsOut: number;
  sellPrice: number;
  allocation: CompanyAllocation;
  ae: { id: string; rowUnits: number; wageCost: number };
  workers: Array<{ id: string; rowUnits: number; wageCost: number }>;
  selfWork?: { id: string; rowUnits: number; wageCost: number };
}): EnrichedProducerRow[] {
  const { unitsOut, allocation } = input;
  const eff = allocation.effectiveInputCostPerUnit;
  const soldFraction = unitsOut > 0 ? allocation.soldOut / unitsOut : 0;

  const one = (kind: EnrichedProducerRow["kind"], id: string, rowUnits: number, wageCost: number): EnrichedProducerRow => {
    const dailyCost = wageCost + rowUnits * eff;
    const rowRevenue = rowUnits * soldFraction * input.sellPrice;
    return {
      kind,
      id,
      rowUnits,
      wageCost,
      dailyCost,
      profitNow: rowRevenue - dailyCost,
      recommendedSell: recommendedSell(dailyCost, rowUnits),
    };
  };

  const out: EnrichedProducerRow[] = [one("ae", input.ae.id, input.ae.rowUnits, input.ae.wageCost)];
  for (const w of input.workers) out.push(one("worker", w.id, w.rowUnits, w.wageCost));
  if (input.selfWork) out.push(one("selfWork", input.selfWork.id, input.selfWork.rowUnits, input.selfWork.wageCost));
  return out;
}
```

Handle `unitsOut === 0`: all row profits `-wageCost` (no input share); rec. sell null.

- [ ] **Step 4: Run — expect pass**

Run: `vp test src/economy/portfolio/enrichRows.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/economy/portfolio/
git commit -m "$(cat <<'EOF'
feat(economy): enrich producer rows with cost and recommended sell
EOF
)"
```

---

### Task 4: Wire derive + CompanySimProvider

**Files:**
- Modify: `src/web/features/companies/sim/derive.ts`
- Modify: `src/web/features/companies/sim/derive.test.ts`
- Modify: `src/web/features/companies/sim/CompanySimProvider.tsx`

**Interfaces:**
- Consumes: `allocatePortfolio`, `enrichProducerRows`, `getRecipe`, `BookPrices`
- Produces:
  - `DerivedCompanyCard` gains `allocation: CompanyAllocation | null`, `producerRows: EnrichedProducerRow[]`, `actualProfit: number`, `markToMarketProfit: number`
  - `derivePortfolioCards(rows, state, ownerDefaults, book): { cards: DerivedCompanyCard[]; portfolioActual: number; portfolioMarkToMarket: number }`
  - Context: replace sole reliance on `portfolioNet` with Actual (primary); keep `portfolioNet` as alias of `portfolioActual` **or** rename carefully and update all call sites

- [ ] **Step 1: Add helper to build `PortfolioCompanyInput` from a derived card + row**

In `derive.ts` (or `sim/portfolioBridge.ts` if file grows):

```ts
import { getRecipe } from "../../../../economy/recipes";
import { allocatePortfolio, enrichProducerRows } from "../../../../economy/portfolio";

function unitsFromPp(itemCode: string | null, pp: number): number {
  if (itemCode == null) return 0;
  const recipe = getRecipe(itemCode);
  if (recipe == null || recipe.consumedPp <= 0) return 0;
  return pp / recipe.consumedPp;
}

function inputDemandFor(itemCode: string | null, unitsOut: number): Record<string, number> {
  if (itemCode == null || !(unitsOut > 0)) return {};
  const recipe = getRecipe(itemCode);
  if (recipe == null) return {};
  const demand: Record<string, number> = {};
  for (const input of recipe.inputs) {
    demand[input.itemCode] = (demand[input.itemCode] ?? 0) + unitsOut * input.quantity;
  }
  return demand;
}
```

After mapping `deriveCompanyCard` for each advisor row **in `companies` array order**:

```ts
const inputs = cards.map((card, i) => {
  const row = companies[i]!;
  const itemCode = /* overridden item still from row.company.itemCode */;
  const unitsOut = card.day.unitsProduced ?? 0;
  return {
    companyId: card.companyId,
    itemCode,
    unitsOut,
    wageCostPerDay: card.day.workerWageCostPerDay,
    inputDemand: inputDemandFor(itemCode, unitsOut),
  };
});
const allocation = allocatePortfolio(inputs, book ?? { buy: {}, sell: {} });
// attach to each card; build producerRows using aeDailyPp / worker effectivePp / consumedPp
```

Sell price for enrich: `book.sell[itemCode]` (finite) or `0` if missing (then profits may be NaN — prefer pass through finite checks).

AE row units: `unitsFromPp(itemCode, card.day.aeDailyPp)`.  
Worker row units: `unitsFromPp(itemCode, day.current.effectivePpPerDay)`.  
Worker wage: `day.current.ownerCostPerDay`.  
Self-work PP counts in `unitsOut` via `companyDay` already; do **not** add a list row in v1 (omit `selfWork` in `enrichProducerRows` call).

Set `card.actualProfit` / `markToMarketProfit` from allocation.  
`derivePortfolioNet` → sum of `actualProfit` (update tests that expected old `netPerDay` portfolio).

- [ ] **Step 2: Update `CompanySimProvider`**

```ts
const { cards, portfolioActual, portfolioMarkToMarket } = derivePortfolioCards(
  companies,
  state,
  ownerDefaults,
  bookPrices,
);
// context value includes portfolioActual, portfolioMarkToMarket
// portfolioNet = portfolioActual for backward compat during UI task
```

- [ ] **Step 3: Fix/extend `derive.test.ts`**

Add one iron+steel ordered pair test asserting steel `marketBuyCash` / iron `soldOut` after derive portfolio pass (construct two advisor rows with controlled `companyDay` inputs via overrides — or unit-test the bridge with minimal stubs if full advisor fixtures are heavy). Prefer testing `derivePortfolioCards` with the same `row()` helpers already in `derive.test.ts`, setting itemCodes iron/steel and mocking book.

If full card construction is too heavy, extract `applyPortfolioAllocation(cards, book)` pure function and test that with hand-built `DerivedCompanyCard`-like day fields — keep the extract in `derive.ts`.

- [ ] **Step 4: Run**

Run: `vp test src/web/features/companies/sim/derive.test.ts src/economy/portfolio/`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/features/companies/sim/ src/economy/portfolio/
git commit -m "$(cat <<'EOF'
feat(companies): wire portfolio allocation into company sim derive
EOF
)"
```

---

### Task 5: UI — dual profit (portfolio + company header)

**Files:**
- Modify: `src/web/features/companies/CompaniesPage.tsx` (`PortfolioNetBanner`)
- Modify: `src/web/features/companies/CompanyCardSummary.tsx`
- Modify: `src/web/features/companies/sim/CompanySimProvider.tsx` (ensure context fields)

**Interfaces:**
- Consumes: `portfolioActual`, `portfolioMarkToMarket`, `card.actualProfit`, `card.markToMarketProfit`
- Produces: layout A compact pair

- [ ] **Step 1: Portfolio banner**

Replace single net with:

```tsx
function PortfolioNetBanner() {
  const { portfolioActual, portfolioMarkToMarket } = useCompanySim();
  // Primary: Actual +X/day (success styling when positive)
  // Secondary muted: If sold +Y/day
  // title/tooltip: Actual = after using own production as inputs; If sold = all sold / all bought on market
}
```

- [ ] **Step 2: Company card badge**

In `CompanyCardSummary`, replace sole `summary.day.netPerDay` badge with Actual (`summary.actualProfit`) primary + If sold (`summary.markToMarketProfit`) underneath (same structure as brainstorm mock A). Keep other summary fields; optionally leave `Net @10% fid` on old fidelity projection from `day` (still useful) — do not rename in this task unless confusing.

- [ ] **Step 3: Manual check**

Run: `vp run dev` → open `/companies` with a loaded player. Confirm portfolio + card headers show two figures.

- [ ] **Step 4: Commit**

```bash
git add src/web/features/companies/CompaniesPage.tsx src/web/features/companies/CompanyCardSummary.tsx src/web/features/companies/sim/CompanySimProvider.tsx
git commit -m "$(cat <<'EOF'
feat(companies): show actual vs if-sold profit on cards and portfolio
EOF
)"
```

---

### Task 6: UI — AE row + worker daily cost / recommended sell

**Files:**
- Modify: `src/web/features/companies/CompaniesPage.tsx` (`WorkerListItem`, `CompanyWorkersSection`)

**Interfaces:**
- Consumes: `summary.producerRows` (`EnrichedProducerRow`)
- Produces: AE list item first; workers use enriched dailyCost / profitNow / recommendedSell

- [ ] **Step 1: Extend `WorkerListItem` metrics**

For each worker, find `producerRows` entry `kind === "worker" && id === worker.id`:

- **Daily cost** → `enriched.dailyCost` (not `day.current.ownerCostPerDay` alone)
- **Profit now** → `enriched.profitNow`
- Add **Rec. sell** cell: `enriched.recommendedSell` via `GoldAmount` / `formatDisplayNumber` (hide if null)
- Keep Wage + Profit @10% (max fidelity can remain from `day.atMaxFidelity` for now — still wage-based projection; do not invent fidelity×allocation in v1)

- [ ] **Step 2: Render AE row**

Before workers `<ul>`, render AE from `producerRows.find(r => r.kind === "ae")` when `aeLevel > 0` or always when `rowUnits > 0 || aeLevel >= 1`:

```tsx
<li className="...same card chrome...">
  <span className="font-medium">AE {aeLevel}</span>
  <Badge>Idle</Badge>
  {/* Daily cost, Profit now, Rec. sell — no Wage */}
</li>
```

Use same metric grid classes as workers for visual consistency.

- [ ] **Step 3: Manual check**

With iron + steel companies (or session prices), confirm steel Rec. sell / costs move when iron is present; AE row appears above workers.

- [ ] **Step 4: Commit**

```bash
git add src/web/features/companies/CompaniesPage.tsx
git commit -m "$(cat <<'EOF'
feat(companies): AE producer row with cost and recommended sell
EOF
)"
```

---

### Task 7: Spec status + verification sweep

**Files:**
- Modify: `docs/superpowers/specs/2026-08-10-companies-portfolio-allocation-recommended-sell-design.md` (Status → Implemented)
- Optionally one-line note in `docs/warera-api/inventory.md` only if this changes WarEra fetch/storage (it should **not** — skip inventory unless something unexpected was added)

- [ ] **Step 1: Run full related tests**

Run:

```bash
vp test src/economy/portfolio/ src/web/features/companies/sim/derive.test.ts src/economy/workers/
vp check
```

Expected: tests pass; check clean (or only pre-existing unrelated issues).

- [ ] **Step 2: Mark spec Implemented**

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-08-10-companies-portfolio-allocation-recommended-sell-design.md
git commit -m "$(cat <<'EOF'
docs: mark portfolio allocation design implemented
EOF
)"
```

---

## Spec coverage

| Requirement | Task |
| --- | --- |
| Daily cost = wage + effective inputs | 3, 6 |
| Portfolio waterfall, card order | 1–2, 4 |
| Free internal / market shortfall & surplus | 1–2 |
| Actual vs If sold (card + portfolio) | 4–5 |
| AE row | 3, 6 |
| Recommended sell per producer | 3, 6 |
| Session buy/sell book | 2, 4 |
| No opportunities table change | — (explicit non-touch) |
| Self-work in pool, no list row | 4 |

## Plan self-review

- Spec coverage: mapped above; inventory skip justified (no WarEra data-tier change).
- No TBD steps; ε fixed at `0.001`.
- Types consistent: `PortfolioCompanyInput` → `CompanyAllocation` → `EnrichedProducerRow` → `DerivedCompanyCard`.
- Consumer competition for free supply: **card order** (stated in Task 1).
