# Factory Growth Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/growth` page that loads a lean player company snapshot, runs client-side Optimal vs Upgrades-only path search to an `N×AE7` goal, and shows a TanStack production curve plus buy/upgrade step log.

**Architecture:** Pure planner math lives in `src/growth/` (costs, income, Dijkstra). `GET /api/growth/bootstrap` returns only planner inputs (reuse company-pack + price snapshots). Web UI mirrors 3dcut layout: controls → full-width chart → step log → factories.

**Tech Stack:** TypeScript, Hono, Vitest via `vp test`, Vite+ (`vp check`), TanStack Router, `@tanstack/charts` + `@tanstack/react-charts`, existing `src/economy` Profit/PP helpers.

**Design:** [2026-08-02-factory-growth-planner-design.md](../specs/2026-08-02-factory-growth-planner-design.md)

## Global Constraints

- Goal: ≥ N companies at AE7 (N = 1…12)
- Paths: Optimal (`maxCompanies = 12`) and Upgrades-only (`maxCompanies = max(currentCount, N)`)
- Every owned company earns AE income (no skill-slot modeling)
- New company `#k` costs `k × 50` Concrete (wiki flat-100 is wrong)
- AE upgrade Steel: 20, 40, 80, 160, 320, 640 for L1→L2 … L6→L7
- Side income: single editable `extraGoldPerDay`
- New companies: default best Profit/PP item; user overrideable
- Client computes plans; API only boots lean data
- No storage upgrades, selling, or mid-plan retask/relocate
- Prefer `vp test` / `vp check` for verification
- Commit after each task

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/growth/costs.ts` | Concrete buy + Steel upgrade material amounts |
| `src/growth/income.ts` | Daily/hourly gold from factories + extra |
| `src/growth/afford.ts` | Inventory-first spend + wait hours |
| `src/growth/plan.ts` | Dijkstra path search → steps + series |
| `src/growth/*.test.ts` | Unit tests for pure planner |
| `src/growth/index.ts` | Public exports |
| `src/growth/bootstrap.ts` | Build lean bootstrap DTO from pack + prices |
| `src/economy/load-company-pack.ts` | Shared pack load/refresh (used by advisor + bootstrap) |
| `src/server/routes/growth.ts` | `GET /bootstrap` |
| `src/server/routes/growth.test.ts` | Route shape tests |
| `src/server/app.ts` | Mount `/api/growth` |
| `src/web/routes/growth.tsx` | Route entry |
| `src/web/features/growth/*` | Page, chart, types, controls |
| `src/web/layout/Shell.tsx` | Add Growth nav tab |
| `.agents/skills/warera-game-mechanics/companies.md` | Fix company cost rule |

---

### Task 1: Cost tables + income helpers

**Files:**
- Create: `src/growth/costs.ts`
- Create: `src/growth/costs.test.ts`
- Create: `src/growth/income.ts`
- Create: `src/growth/income.test.ts`
- Create: `src/growth/index.ts`
- Modify: `.agents/skills/warera-game-mechanics/companies.md` (extra company cost row)

**Interfaces:**
- Consumes: `aeDailyValue` from `src/economy/profit.ts`
- Produces:
  - `export const CONCRETE_PER_COMPANY_INDEX = 50`
  - `export const MAX_AE_LEVEL = 7`
  - `export const MAX_COMPANIES = 12`
  - `export function concreteForNewCompany(nextCompanyIndex: number): number` — `nextCompanyIndex * 50` for index ≥ 1
  - `export function steelForAeUpgrade(fromLevel: number): number` — Steel to go `fromLevel → fromLevel+1`; `fromLevel` in 1..6
  - `export type GrowthFactory = { id: string; aeLevel: number; goldPerAePerDay: number }`
  - `export function dailyGoldFromFactories(factories: GrowthFactory[], extraGoldPerDay: number): number`
  - `export function hourlyGoldFromFactories(factories: GrowthFactory[], extraGoldPerDay: number): number`
  - `export function goldPerAePerDayFromProfit(profitPerPp: number, bonus: number): number` — `aeDailyValue(1, bonus, profitPerPp)`

- [ ] **Step 1: Write failing tests**

`src/growth/costs.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { concreteForNewCompany, steelForAeUpgrade } from "./costs";

describe("concreteForNewCompany", () => {
  it("scales linearly by 50", () => {
    expect(concreteForNewCompany(1)).toBe(50);
    expect(concreteForNewCompany(2)).toBe(100);
    expect(concreteForNewCompany(3)).toBe(150);
    expect(concreteForNewCompany(12)).toBe(600);
  });
});

describe("steelForAeUpgrade", () => {
  it("matches wiki doubling table", () => {
    expect(steelForAeUpgrade(1)).toBe(20);
    expect(steelForAeUpgrade(2)).toBe(40);
    expect(steelForAeUpgrade(3)).toBe(80);
    expect(steelForAeUpgrade(4)).toBe(160);
    expect(steelForAeUpgrade(5)).toBe(320);
    expect(steelForAeUpgrade(6)).toBe(640);
  });
});
```

`src/growth/income.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { dailyGoldFromFactories, goldPerAePerDayFromProfit, hourlyGoldFromFactories } from "./income";

describe("goldPerAePerDayFromProfit", () => {
  it("equals AE1 daily value", () => {
    // 1 * (1+0.5) * 24 * 0.1 = 3.6
    expect(goldPerAePerDayFromProfit(0.1, 0.5)).toBeCloseTo(3.6);
  });
});

describe("dailyGoldFromFactories", () => {
  it("sums ae * gPerAe + extra", () => {
    const factories = [
      { id: "a", aeLevel: 2, goldPerAePerDay: 3 },
      { id: "b", aeLevel: 1, goldPerAePerDay: 4 },
    ];
    expect(dailyGoldFromFactories(factories, 10)).toBeCloseTo(2 * 3 + 1 * 4 + 10);
  });
});

describe("hourlyGoldFromFactories", () => {
  it("divides daily by 24", () => {
    expect(hourlyGoldFromFactories([{ id: "a", aeLevel: 1, goldPerAePerDay: 24 }], 0)).toBeCloseTo(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/growth/costs.test.ts src/growth/income.test.ts`

Expected: FAIL (modules missing)

- [ ] **Step 3: Implement costs + income**

`src/growth/costs.ts`:

```ts
export const CONCRETE_PER_COMPANY_INDEX = 50;
export const MAX_AE_LEVEL = 7;
export const MAX_COMPANIES = 12;

/** Concrete units to buy company `#nextCompanyIndex` (1-based). */
export function concreteForNewCompany(nextCompanyIndex: number): number {
  if (!Number.isInteger(nextCompanyIndex) || nextCompanyIndex < 1) {
    throw new Error("nextCompanyIndex must be an integer >= 1");
  }
  return nextCompanyIndex * CONCRETE_PER_COMPANY_INDEX;
}

/** Steel units to upgrade AE from `fromLevel` to `fromLevel + 1`. */
export function steelForAeUpgrade(fromLevel: number): number {
  if (!Number.isInteger(fromLevel) || fromLevel < 1 || fromLevel >= MAX_AE_LEVEL) {
    throw new Error("fromLevel must be an integer in 1..6");
  }
  return 20 * 2 ** (fromLevel - 1);
}
```

`src/growth/income.ts`:

```ts
import { aeDailyValue } from "../economy/profit";

export type GrowthFactory = {
  id: string;
  aeLevel: number;
  goldPerAePerDay: number;
};

export function goldPerAePerDayFromProfit(profitPerPp: number, bonus: number): number {
  return aeDailyValue(1, bonus, profitPerPp);
}

export function dailyGoldFromFactories(
  factories: GrowthFactory[],
  extraGoldPerDay: number,
): number {
  let sum = extraGoldPerDay;
  for (const f of factories) {
    sum += f.aeLevel * f.goldPerAePerDay;
  }
  return sum;
}

export function hourlyGoldFromFactories(
  factories: GrowthFactory[],
  extraGoldPerDay: number,
): number {
  return dailyGoldFromFactories(factories, extraGoldPerDay) / 24;
}
```

`src/growth/index.ts`:

```ts
export {
  CONCRETE_PER_COMPANY_INDEX,
  MAX_AE_LEVEL,
  MAX_COMPANIES,
  concreteForNewCompany,
  steelForAeUpgrade,
} from "./costs";
export {
  dailyGoldFromFactories,
  goldPerAePerDayFromProfit,
  hourlyGoldFromFactories,
  type GrowthFactory,
} from "./income";
```

Update companies.md Obtaining table row:

```markdown
| Extra company | `k × 50` Concrete for company `#k` (1st=50, 2nd=100, …). Wiki “100 flat” is incorrect. |
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/growth/costs.test.ts src/growth/income.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/growth/costs.ts src/growth/costs.test.ts src/growth/income.ts src/growth/income.test.ts src/growth/index.ts .agents/skills/warera-game-mechanics/companies.md
git commit -m "feat(growth): add company cost and AE income helpers"
```

---

### Task 2: Affordability helpers (inventory-first spend + wait)

**Files:**
- Create: `src/growth/afford.ts`
- Create: `src/growth/afford.test.ts`
- Modify: `src/growth/index.ts`

**Interfaces:**
- Consumes: none from Task 1 beyond numbers
- Produces:
  - `export type Wallet = { gold: number; steel: number; concrete: number }`
  - `export type MaterialSpend = { steel?: number; concrete?: number }`
  - `export function goldCostAfterInventory(wallet: Wallet, spend: MaterialSpend, prices: { steel: number; concrete: number }): { goldNeeded: number; nextWallet: Wallet }`
  - `export function waitHoursToAfford(goldNeeded: number, gold: number, goldPerHour: number): number` — `0` if already affordable; `Infinity` if `goldNeeded > gold` and `goldPerHour <= 0`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vite-plus/test";
import { goldCostAfterInventory, waitHoursToAfford } from "./afford";

describe("goldCostAfterInventory", () => {
  it("uses inventory before market gold", () => {
    const { goldNeeded, nextWallet } = goldCostAfterInventory(
      { gold: 100, steel: 10, concrete: 5 },
      { steel: 20, concrete: 10 },
      { steel: 2, concrete: 1 },
    );
    // need 10 more steel => 20G, 5 more concrete => 5G
    expect(goldNeeded).toBeCloseTo(25);
    expect(nextWallet.steel).toBe(0);
    expect(nextWallet.concrete).toBe(0);
    expect(nextWallet.gold).toBe(100); // gold not deducted here
  });

  it("covers fully from inventory with 0 gold needed", () => {
    const { goldNeeded, nextWallet } = goldCostAfterInventory(
      { gold: 50, steel: 100, concrete: 0 },
      { steel: 40 },
      { steel: 2, concrete: 1 },
    );
    expect(goldNeeded).toBe(0);
    expect(nextWallet.steel).toBe(60);
  });
});

describe("waitHoursToAfford", () => {
  it("returns 0 when already affordable", () => {
    expect(waitHoursToAfford(50, 50, 1)).toBe(0);
    expect(waitHoursToAfford(40, 50, 1)).toBe(0);
  });

  it("waits for the shortfall", () => {
    expect(waitHoursToAfford(100, 40, 10)).toBeCloseTo(6);
  });

  it("is infinite when broke with no income", () => {
    expect(waitHoursToAfford(10, 0, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/growth/afford.test.ts`

Expected: FAIL (module missing)

- [ ] **Step 3: Implement afford.ts**

```ts
export type Wallet = {
  gold: number;
  steel: number;
  concrete: number;
};

export type MaterialSpend = {
  steel?: number;
  concrete?: number;
};

export function goldCostAfterInventory(
  wallet: Wallet,
  spend: MaterialSpend,
  prices: { steel: number; concrete: number },
): { goldNeeded: number; nextWallet: Wallet } {
  let steel = wallet.steel;
  let concrete = wallet.concrete;
  let goldNeeded = 0;

  const needSteel = spend.steel ?? 0;
  if (needSteel > 0) {
    const fromInv = Math.min(steel, needSteel);
    steel -= fromInv;
    goldNeeded += (needSteel - fromInv) * prices.steel;
  }

  const needConcrete = spend.concrete ?? 0;
  if (needConcrete > 0) {
    const fromInv = Math.min(concrete, needConcrete);
    concrete -= fromInv;
    goldNeeded += (needConcrete - fromInv) * prices.concrete;
  }

  return {
    goldNeeded,
    nextWallet: { gold: wallet.gold, steel, concrete },
  };
}

export function waitHoursToAfford(
  goldNeeded: number,
  gold: number,
  goldPerHour: number,
): number {
  if (goldNeeded <= gold) return 0;
  if (goldPerHour <= 0) return Number.POSITIVE_INFINITY;
  return (goldNeeded - gold) / goldPerHour;
}
```

Export the new symbols from `src/growth/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test src/growth/afford.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/growth/afford.ts src/growth/afford.test.ts src/growth/index.ts
git commit -m "feat(growth): add inventory-first affordability helpers"
```

---

### Task 3: Path planner (Dijkstra) + chart series

**Files:**
- Create: `src/growth/plan.ts`
- Create: `src/growth/plan.test.ts`
- Modify: `src/growth/index.ts`

**Interfaces:**
- Consumes: costs, income, afford helpers from Tasks 1–2
- Produces:
  - `export type GrowthPathMode = "optimal" | "upgrades_only"`
  - `export type GrowthPlanInput = { factories: GrowthFactory[]; goalAe7Count: number; mode: GrowthPathMode; wallet: Wallet; prices: { steel: number; concrete: number }; extraGoldPerDay: number; newFactoryGoldPerAePerDay: number; maxIterations?: number }`
  - `export type GrowthPlanStep = { tHours: number; action: "buy" | "upgrade"; factoryId: string; fromLevel: number; toLevel: number; dailyGoldAfter: number; deltaDailyGold: number; goldSpent: number }`
  - `export type GrowthPlanSeriesPoint = { tHours: number; dailyGold: number }`
  - `export type GrowthPlanResult = { complete: boolean; stuck: boolean; hitIterLimit: boolean; timeToGoalHours: number | null; steps: GrowthPlanStep[]; series: GrowthPlanSeriesPoint[]; finalFactories: GrowthFactory[] }`
  - `export function planGrowthPath(input: GrowthPlanInput): GrowthPlanResult`

**Algorithm notes (implement exactly):**
- State key = sorted `aeLevel` list joined by `|` (factory identity for upgrades: keep stable ids; new factories get `new-${n}`).
- Goal: count of `aeLevel === 7` ≥ `goalAe7Count`.
- `maxCompanies`: Optimal → 12; Upgrades-only → `max(factories.length, goalAe7Count)`.
- Pop min time from a binary min-heap.
- For each action, compute material spend → `goldNeeded` → `wait` from current hourly rate → if finite, apply wait (add `wait * hourly` gold), pay `goldNeeded`, mutate factories/wallet, push `time + wait`.
- After each applied action, append a step and extend the series with a point at the new time.
- First series point at `t=0` with starting daily gold.
- Cap iterations at `maxIterations ?? 200_000`.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vite-plus/test";
import { planGrowthPath } from "./plan";
import type { GrowthFactory } from "./income";

const prices = { steel: 1, concrete: 1 };

function fac(id: string, aeLevel: number, goldPerAePerDay = 1): GrowthFactory {
  return { id, aeLevel, goldPerAePerDay };
}

describe("planGrowthPath", () => {
  it("is complete immediately when goal already met", () => {
    const result = planGrowthPath({
      factories: [fac("a", 7), fac("b", 7)],
      goalAe7Count: 2,
      mode: "optimal",
      wallet: { gold: 0, steel: 0, concrete: 0 },
      prices,
      extraGoldPerDay: 0,
      newFactoryGoldPerAePerDay: 1,
    });
    expect(result.complete).toBe(true);
    expect(result.steps).toHaveLength(0);
    expect(result.timeToGoalHours).toBe(0);
  });

  it("upgrades_only never buys beyond goal N", () => {
    const result = planGrowthPath({
      factories: [fac("a", 6)],
      goalAe7Count: 1,
      mode: "upgrades_only",
      wallet: { gold: 10_000, steel: 0, concrete: 0 },
      prices,
      extraGoldPerDay: 0,
      newFactoryGoldPerAePerDay: 1,
    });
    expect(result.complete).toBe(true);
    expect(result.steps.every((s) => s.action === "upgrade")).toBe(true);
    expect(result.finalFactories.length).toBe(1);
  });

  it("optimal may buy an extra company when helpful", () => {
    // High new-factory income + huge cash: buying can appear in the path toward 1×AE7 from empty-ish start.
    const result = planGrowthPath({
      factories: [fac("a", 1, 0.01)],
      goalAe7Count: 1,
      mode: "optimal",
      wallet: { gold: 50_000, steel: 0, concrete: 0 },
      prices: { steel: 1, concrete: 1 },
      extraGoldPerDay: 0,
      newFactoryGoldPerAePerDay: 5,
    });
    expect(result.complete).toBe(true);
    // Not asserting a buy is mandatory for all inputs — assert planner returns a finite plan
    // and never exceeds 12 companies.
    expect(result.finalFactories.length).toBeLessThanOrEqual(12);
    expect(result.finalFactories.filter((f) => f.aeLevel === 7).length).toBeGreaterThanOrEqual(1);
  });

  it("marks stuck when no income and cannot afford", () => {
    const result = planGrowthPath({
      factories: [fac("a", 1, 0)],
      goalAe7Count: 1,
      mode: "upgrades_only",
      wallet: { gold: 0, steel: 0, concrete: 0 },
      prices,
      extraGoldPerDay: 0,
      newFactoryGoldPerAePerDay: 1,
    });
    expect(result.complete).toBe(false);
    expect(result.stuck).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/growth/plan.test.ts`

Expected: FAIL (module missing)

- [ ] **Step 3: Implement plan.ts**

Implement a min-heap Dijkstra per the algorithm notes. File structure:

1. Types (`GrowthPathMode`, `GrowthPlanInput`, `GrowthPlanStep`, `GrowthPlanSeriesPoint`, `GrowthPlanResult`) exactly as in Interfaces.
2. Tiny binary min-heap (`push(priority, value)` / `pop()`).
3. Helpers: `stateKey`, `ae7Count`, `cloneFactories`.
4. `planGrowthPath`:

```ts
export function planGrowthPath(input: GrowthPlanInput): GrowthPlanResult {
  const maxCompanies =
    input.mode === "optimal"
      ? MAX_COMPANIES
      : Math.max(input.factories.length, input.goalAe7Count);
  const maxIterations = input.maxIterations ?? 200_000;

  const startDaily = dailyGoldFromFactories(input.factories, input.extraGoldPerDay);
  if (ae7Count(input.factories) >= input.goalAe7Count) {
    return {
      complete: true,
      stuck: false,
      hitIterLimit: false,
      timeToGoalHours: 0,
      steps: [],
      series: [{ tHours: 0, dailyGold: startDaily }],
      finalFactories: input.factories.map((f) => ({ ...f })),
    };
  }

  type Node = {
    time: number;
    factories: GrowthFactory[];
    wallet: Wallet;
    steps: GrowthPlanStep[];
    series: GrowthPlanSeriesPoint[];
  };

  const heap = new MinHeap<Node>();
  const visited = new Set<string>();
  heap.push(0, {
    time: 0,
    factories: input.factories.map((f) => ({ ...f })),
    wallet: { ...input.wallet },
    steps: [],
    series: [{ tHours: 0, dailyGold: startDaily }],
  });

  let iter = 0;
  let stuck = false;
  let hitIterLimit = false;
  let bestIncomplete: Node | null = null;

  while (heap.size > 0 && iter < maxIterations) {
    iter++;
    const node = heap.pop()!;
    const key = stateKey(node.factories);
    if (visited.has(key)) continue;
    visited.add(key);
    bestIncomplete = node;

    if (ae7Count(node.factories) >= input.goalAe7Count) {
      return {
        complete: true,
        stuck: false,
        hitIterLimit: false,
        timeToGoalHours: node.time,
        steps: node.steps,
        series: node.series,
        finalFactories: node.factories,
      };
    }

    const hourly = hourlyGoldFromFactories(node.factories, input.extraGoldPerDay);
    const dailyBefore = dailyGoldFromFactories(node.factories, input.extraGoldPerDay);
    let anyNeighbor = false;

    const tryApply = (
      spend: { steel?: number; concrete?: number },
      apply: (factories: GrowthFactory[]) => {
        factories: GrowthFactory[];
        action: GrowthPlanStep["action"];
        factoryId: string;
        fromLevel: number;
        toLevel: number;
      },
    ) => {
      const { goldNeeded, nextWallet } = goldCostAfterInventory(
        node.wallet,
        spend,
        input.prices,
      );
      const wait = waitHoursToAfford(goldNeeded, nextWallet.gold, hourly);
      if (!Number.isFinite(wait)) return;
      anyNeighbor = true;
      const goldAfterWait = nextWallet.gold + wait * hourly;
      const paid: Wallet = {
        gold: goldAfterWait - goldNeeded,
        steel: nextWallet.steel,
        concrete: nextWallet.concrete,
      };
      const applied = apply(node.factories.map((f) => ({ ...f })));
      const tHours = node.time + wait;
      const dailyGoldAfter = dailyGoldFromFactories(applied.factories, input.extraGoldPerDay);
      const step: GrowthPlanStep = {
        tHours,
        action: applied.action,
        factoryId: applied.factoryId,
        fromLevel: applied.fromLevel,
        toLevel: applied.toLevel,
        dailyGoldAfter,
        deltaDailyGold: dailyGoldAfter - dailyBefore,
        goldSpent: goldNeeded,
      };
      heap.push(tHours, {
        time: tHours,
        factories: applied.factories,
        wallet: paid,
        steps: [...node.steps, step],
        series: [...node.series, { tHours, dailyGold: dailyGoldAfter }],
      });
    };

    for (let i = 0; i < node.factories.length; i++) {
      const f = node.factories[i]!;
      if (f.aeLevel >= MAX_AE_LEVEL) continue;
      const steel = steelForAeUpgrade(f.aeLevel);
      tryApply({ steel }, (factories) => {
        const fromLevel = factories[i]!.aeLevel;
        factories[i] = { ...factories[i]!, aeLevel: fromLevel + 1 };
        return {
          factories,
          action: "upgrade",
          factoryId: factories[i]!.id,
          fromLevel,
          toLevel: fromLevel + 1,
        };
      });
    }

    if (node.factories.length < maxCompanies) {
      const nextIndex = node.factories.length + 1;
      const concrete = concreteForNewCompany(nextIndex);
      tryApply({ concrete }, (factories) => {
        const factoryId = `new-${nextIndex}`;
        factories.push({
          id: factoryId,
          aeLevel: 1,
          goldPerAePerDay: input.newFactoryGoldPerAePerDay,
        });
        return { factories, action: "buy", factoryId, fromLevel: 0, toLevel: 1 };
      });
    }

    if (!anyNeighbor && hourly <= 0) stuck = true;
  }

  if (iter >= maxIterations) hitIterLimit = true;
  return {
    complete: false,
    stuck,
    hitIterLimit,
    timeToGoalHours: null,
    steps: bestIncomplete?.steps ?? [],
    series: bestIncomplete?.series ?? [{ tHours: 0, dailyGold: startDaily }],
    finalFactories: bestIncomplete?.factories ?? input.factories.map((f) => ({ ...f })),
  };
}
```

Include a small `MinHeap` class in the same file. Export new types/functions from `src/growth/index.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/growth/plan.test.ts`

Expected: PASS

If the “optimal may buy” case is flaky given income math, tighten the fixture (e.g. start with AE6 + tiny income and cash exactly covering a buy that speeds a second AE7) or assert only invariants (`complete`, caps, ae7 count). Do not weaken caps/goal tests.

- [ ] **Step 5: Commit**

```bash
git add src/growth/plan.ts src/growth/plan.test.ts src/growth/index.ts
git commit -m "feat(growth): add Dijkstra path planner for AE7 goals"
```

---

### Task 4: Shared company-pack load + growth bootstrap API

**Files:**
- Create: `src/economy/load-company-pack.ts`
- Modify: `src/economy/advisor.ts` — use shared loader (behavior unchanged)
- Create: `src/growth/bootstrap.ts`
- Create: `src/growth/bootstrap.test.ts`
- Create: `src/server/routes/growth.ts`
- Create: `src/server/routes/growth.test.ts`
- Modify: `src/server/app.ts` — `app.route("/api/growth", growthRoutes(...))`
- Modify: `src/growth/index.ts` — export bootstrap types if useful for web

**Interfaces:**
- Produces:
  - `export async function loadCompanyPackForUser(options: { db; warera; userId; refresh?: boolean }): Promise<{ companies: CompanyPackEntry[]; fetchedAt: number | null; refreshed: boolean }>`
  - `export type GrowthBootstrapCompany = { id: string; name: string; aeLevel: number; itemCode: string | null; productionBonus: number | null; goldPerAePerDay: number }`
  - `export type GrowthBootstrapResponse = { recordedAt: string | null; companiesFetchedAt: number | null; companiesRefreshed: boolean; companies: GrowthBootstrapCompany[]; prices: { steel: number | null; concrete: number | null }; bestItem: { itemCode: string; profitPerPp: number; suggestedBonus: number } | null; opportunitiesLite: { itemCode: string; profitPerPp: number }[]; startBalance: number; steel: number; concrete: number }`
  - `export async function buildGrowthBootstrap(...): Promise<GrowthBootstrapResponse>`
  - Route: `GET /api/growth/bootstrap?userId=&refresh=`

**Bootstrap rules:**
- Load prices via `getLatestPrices` / `marketPriceMap` (poll if empty, same as advisor).
- `opportunitiesLite` from `listMarketOpportunities` mapped to `{ itemCode, profitPerPp }` (finite only).
- `bestItem` = top opportunity; `suggestedBonus` = average of company `productionBonus` values that are non-null, else `0`.
- Per company `goldPerAePerDay`: if item + bonus + profitPerPp available → `goldPerAePerDayFromProfit(ppp, bonus)`; else `0`.
- `startBalance`, `steel`, `concrete` always `0` in v1 (manual overrides in UI).
- Do **not** include switch/payback fields.

- [ ] **Step 1: Extract `loadCompanyPackForUser`**

Move the company-pack hit/miss/refresh block from `buildAdvisor` into `src/economy/load-company-pack.ts` (including bonus enrichment + `upsertCompanyPack` + `enqueueRegions` as advisor does today). Update `buildAdvisor` to call it. Run existing advisor tests:

Run: `vp test src/economy/advisor.test.ts`

Expected: PASS

- [ ] **Step 2: Write failing bootstrap unit test**

`src/growth/bootstrap.test.ts` — test a pure mapper if you split `mapGrowthBootstrap({ packEntries, prices, opportunities })`, or test `buildGrowthBootstrap` with a mocked db/warera following `advisor.test.ts` patterns. Minimum assertions:

```ts
it("returns lean fields without switch recommendations", async () => {
  const result = await buildGrowthBootstrap(/* test deps */);
  expect(result).toHaveProperty("companies");
  expect(result).toHaveProperty("opportunitiesLite");
  expect(result).toHaveProperty("bestItem");
  expect(result.startBalance).toBe(0);
  expect(result).not.toHaveProperty("companies.0.bestSwitch");
});
```

- [ ] **Step 3: Implement bootstrap + route**

`src/server/routes/growth.ts` mirrors `economy.ts` style:

```ts
app.get("/bootstrap", async (c) => {
  const userId = (c.req.query("userId") ?? "").trim();
  if (!userId) throw new HttpError(400, "invalid_query", "userId is required");
  const refreshRaw = (c.req.query("refresh") ?? "").trim().toLowerCase();
  const refresh = refreshRaw === "1" || refreshRaw === "true";
  const result = await buildGrowthBootstrap({ db, warera, logger, userId, refresh });
  return c.json(result);
});
```

Mount in `createApp`.

- [ ] **Step 4: Route test**

`src/server/routes/growth.test.ts` — follow `prices.test.ts` / economy route test style: mount app with in-memory db, stub warera, assert 400 without userId and 200 shape with fixture user.

Run: `vp test src/growth/bootstrap.test.ts src/server/routes/growth.test.ts src/economy/advisor.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/economy/load-company-pack.ts src/economy/advisor.ts src/growth/bootstrap.ts src/growth/bootstrap.test.ts src/growth/index.ts src/server/routes/growth.ts src/server/routes/growth.test.ts src/server/app.ts
git commit -m "feat(growth): add lean bootstrap API for factory planner"
```

---

### Task 5: Growth page shell — route, nav, controls, run both paths

**Files:**
- Create: `src/web/routes/growth.tsx`
- Create: `src/web/features/growth/types.ts`
- Create: `src/web/features/growth/GrowthPage.tsx`
- Create: `src/web/lib/growthSearch.ts` (optional `userId` search param)
- Modify: `src/web/layout/Shell.tsx` — add `{ to: "/growth", label: "Growth" }` after Companies
- Note: TanStack Router codegen updates `routeTree.gen.ts` on dev/build — run `vp dev` once or the project’s route generation so `/growth` is registered

**Interfaces:**
- Consumes: `GET /api/growth/bootstrap`, `planGrowthPath`, `CompaniesPlayerSearch` (reuse from companies feature)
- Produces: working page that loads bootstrap, exposes overrides, computes both paths, shows comparison cards + placeholder regions for chart/log/factories

- [ ] **Step 1: Add route + nav**

`src/web/routes/growth.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { GrowthPage } from "../features/growth/GrowthPage";

export const Route = createFileRoute("/growth")({
  component: GrowthPage,
});
```

Add Growth to `tabs` in `Shell.tsx`.

- [ ] **Step 2: Implement GrowthPage state machine**

Behavior:
1. Reuse `CompaniesPlayerSearch` for user pick (writes same recent-players key is OK for v1).
2. On select: `api<GrowthBootstrapResponse>(\`/api/growth/bootstrap?userId=${id}\`)`.
3. Local override state initialized from bootstrap: `goalN` default `6`, `startBalance`, `steel`, `concrete`, `extraGoldPerDay=0`, `newItemCode` from `bestItem`, `bonus` from `suggestedBonus`, focused path = faster complete path.
4. Editable factory list (ae levels) derived from bootstrap companies; allow level tweaks for what-if.
5. `useMemo` (or plain recompute) both `planGrowthPath` calls when inputs change.
6. Render:
   - Path cards: Optimal / Upgrades-only with time-to-goal (`Xd Yh` or “stuck” / “done”)
   - Override inputs (number fields)
   - Item `<select>` from `opportunitiesLite`
   - Placeholders: “Chart”, “Step log”, “Factories” sections with enough text to verify data (e.g. step count)

Map bootstrap → planner input:

```ts
const newFactoryGoldPerAePerDay = goldPerAePerDayFromProfit(selectedProfitPerPp, bonus);
planGrowthPath({
  factories: editableFactories.map((f) => ({
    id: f.id,
    aeLevel: f.aeLevel,
    goldPerAePerDay: f.goldPerAePerDay,
  })),
  goalAe7Count: goalN,
  mode: "optimal" | "upgrades_only",
  wallet: { gold: startBalance, steel, concrete },
  prices: {
    steel: bootstrap.prices.steel ?? 0,
    concrete: bootstrap.prices.concrete ?? 0,
  },
  extraGoldPerDay,
  newFactoryGoldPerAePerDay,
});
```

If `steel`/`concrete` prices are 0/null, show an inline error and skip planning.

- [ ] **Step 3: Manual smoke**

Run: `vp run dev` (or project equivalent), open `/growth`, pick a known user, confirm bootstrap loads and path cards show times or stuck.

- [ ] **Step 4: Commit**

```bash
git add src/web/routes/growth.tsx src/web/features/growth/types.ts src/web/features/growth/GrowthPage.tsx src/web/layout/Shell.tsx src/web/routeTree.gen.ts src/web/lib/growthSearch.ts
git commit -m "feat(web): add Growth page shell with path comparison"
```

---

### Task 6: Chart, step log, factory list

**Files:**
- Create: `src/web/features/growth/GrowthPathChart.tsx`
- Create: `src/web/features/growth/GrowthStepLog.tsx`
- Create: `src/web/features/growth/GrowthFactoryList.tsx`
- Modify: `src/web/features/growth/GrowthPage.tsx` — compose the three

**Interfaces:**
- Consumes: `GrowthPlanResult` series/steps; factory edit callbacks
- Chart: TanStack Charts with two `lineY` series (Optimal / Upgrades-only). X = hours (or days); Y = daily gold. Include a point at t=0. Optional vertical markers when AE7 count increases can be v1-light (skip if chart API is awkward — step log is enough for milestones).

- [ ] **Step 1: GrowthPathChart**

Build rows like:

```ts
type Row = { tHours: number; optimal?: number; upgradesOnly?: number };
```

Merge both series onto a shared time axis (union of timestamps; forward-fill last daily gold per path). Use `defineChart` + `lineY` similar to `MarketPriceChart.tsx`, with `scaleLinear` on X (hours) and Y (G/day). Height ~360, full width of container.

- [ ] **Step 2: GrowthStepLog**

Table columns: Step #, Action, Time, Δ G/day, G spent. Format time: `<1h` → minutes; `<24h` → hours; else days (same spirit as 3dcut `fmtT`). Show focused path only; title includes path name.

- [ ] **Step 3: GrowthFactoryList**

List factories with name, item, AE level controls (`−` / `+` clamped 1..7), remove for what-if. Header `Your Factories (n/12)`.

- [ ] **Step 4: Wire into GrowthPage layout**

Order: controls + path cards → chart → grid with step log + factory list (step log right or left; match 3dcut: factories left, plan right if easy).

- [ ] **Step 5: Check + commit**

Run: `vp check` and `vp test src/growth`

Expected: PASS

```bash
git add src/web/features/growth/
git commit -m "feat(web): add growth chart, step log, and factory list"
```

---

## Self-review (author)

| Spec requirement | Task |
| --- | --- |
| Goal N×AE7 | 3, 5 |
| Optimal vs Upgrades-only | 3, 5 |
| Optimal may buy ≤12 | 3 |
| Upgrades-only ≤ N | 3 |
| Ignore skill slots | 3 (all factories earn) |
| Extra G/day only | 5 |
| Player load + overrides | 4, 5 |
| Best Profit/PP default + item override | 4, 5 |
| Concrete `k×50` + Steel table | 1 (+ companies.md) |
| Client planner | 3, 5 |
| Lean bootstrap API | 4 |
| TanStack curve both paths | 6 |
| Step log + factory list | 6 |
| `/growth` nav | 5 |
| No eco/sustain / storage / sell | honored (omitted) |

No TBD placeholders. Types aligned: `GrowthFactory`, `Wallet`, `GrowthPlanResult` flow Task 1→3→5→6.
