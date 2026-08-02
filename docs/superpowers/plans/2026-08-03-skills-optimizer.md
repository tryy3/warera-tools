# Skills Optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/skills` page that loads player skills, companies, and job net wage, lets the user what-if eco skill levels with real SP costs, shows daily G breakdowns, and runs “optimize unspent” / “full eco reset.”

**Architecture:** Pure math in `src/skills/` (SP costs, values, income, optimizers). `GET /api/skills/bootstrap` boots skills + company Profit/PP + wage resolve. Web UI mirrors Growth (shell player + TanStack Query) with layout C (skills rail + stacked income).

**Tech Stack:** TypeScript, Hono, Vitest via `vp test`, Vite+ (`vp check`), TanStack Router / Query, existing `src/economy` Profit/PP + company packs, WarEra tRPC client.

**Design:** [2026-08-03-skills-optimizer-design.md](../specs/2026-08-03-skills-optimizer-design.md)

## Global Constraints

- Nav/route: Skills → `/skills`; code in `src/skills/` + `src/web/features/skills/`
- v1 objective: maximize `totalG/day` = work + self-work + AE (no workers/Management)
- SP cost to buy level \(n\) = \(n\); total to level \(L\) = \(L(L+1)/2\)
- Full eco reset: all `totalSkillPoints` into eco; non-eco treated as 0
- Unspent optimize: never lower existing levels; only spend `availableSkillPoints`
- Companies Limit: `activeSlots = min(companiesValue, ownedCount)`; empty slots worth 0
- Self-work: default best owned company by self-work G/day; overrideable
- Job wage: resolve via API when possible; always editable; soft-fail lookup
- Client computes income + optimize; API only boots lean data
- Prefer `vp test` / `vp check` for verification
- Commit after each task

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/skills/sp.ts` | Triangular SP costs |
| `src/skills/values.ts` | Eco skill value-from-level |
| `src/skills/income.ts` | Work / self-work / AE / total daily G |
| `src/skills/optimize.ts` | Unspent + full eco reset |
| `src/skills/bootstrap.ts` | Build lean bootstrap DTO |
| `src/skills/job-wage.ts` | Resolve gross → tax → net |
| `src/skills/index.ts` | Public exports |
| `src/skills/*.test.ts` | Unit tests |
| `src/warera/users.ts` | `getUserLite` / `getUserById` parsers |
| `src/warera/workers.ts` | `worker.getWorkers` + workOffer fallback |
| `src/server/routes/skills.ts` | `GET /bootstrap` |
| `src/server/routes/skills.test.ts` | Route tests |
| `src/server/app.ts` | Mount `/api/skills` |
| `src/web/query/keys.ts` | `skillsBootstrap` key |
| `src/web/query/fetchSkillsBootstrap.ts` | Path + fetch |
| `src/web/query/useSkillsBootstrapQuery.ts` | Hook |
| `src/web/query/loadPlayerData.ts` | Invalidate skills on Load |
| `src/web/lib/skillsSearch.ts` | URL search parse/build |
| `src/web/routes/skills.tsx` | Route entry |
| `src/web/features/skills/*` | Page, cards, types |
| `src/web/layout/Shell.tsx` | Add Skills nav tab |
| `.agents/skills/warera-game-mechanics/` | Note SP costs + income-tax field when confirmed |

---

### Task 1: SP costs + skill values

**Files:**
- Create: `src/skills/sp.ts`
- Create: `src/skills/sp.test.ts`
- Create: `src/skills/values.ts`
- Create: `src/skills/values.test.ts`
- Create: `src/skills/index.ts`

**Interfaces:**
- Produces:
  - `export function spCostForLevel(level: number): number` — cost to buy that level from `level-1`; `level >= 1` → `level`, else 0
  - `export function totalSpToReachLevel(level: number): number` — `level*(level+1)/2` for `level >= 0`
  - `export function totalSpForLevels(levels: Record<string, number>): number` — sum of `totalSpToReachLevel` per entry
  - `export type EcoSkillId = "energy" | "entrepreneurship" | "production" | "companies"`
  - `export const ECO_SKILL_IDS: EcoSkillId[]`
  - `export function skillValueFromLevel(skill: EcoSkillId, level: number): number`
  - Bases/increments: energy 30/+10, entrepreneurship 30/+5, production 10/+3, companies 2/+1

- [ ] **Step 1: Write failing tests**

`src/skills/sp.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { spCostForLevel, totalSpForLevels, totalSpToReachLevel } from "./sp";

describe("spCostForLevel", () => {
  it("costs n SP for level n", () => {
    expect(spCostForLevel(1)).toBe(1);
    expect(spCostForLevel(2)).toBe(2);
    expect(spCostForLevel(4)).toBe(4);
  });
});

describe("totalSpToReachLevel", () => {
  it("sums 1..L", () => {
    expect(totalSpToReachLevel(0)).toBe(0);
    expect(totalSpToReachLevel(4)).toBe(10);
  });
});

describe("totalSpForLevels", () => {
  it("matches getUserLite sample 2+2+3+2 = 15", () => {
    expect(
      totalSpForLevels({
        energy: 2,
        entrepreneurship: 2,
        production: 3,
        lootChance: 2,
      }),
    ).toBe(15);
  });
});
```

`src/skills/values.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { skillValueFromLevel } from "./values";

describe("skillValueFromLevel", () => {
  it("matches known caps", () => {
    expect(skillValueFromLevel("energy", 2)).toBe(50);
    expect(skillValueFromLevel("entrepreneurship", 2)).toBe(40);
    expect(skillValueFromLevel("production", 3)).toBe(19);
    expect(skillValueFromLevel("companies", 0)).toBe(2);
    expect(skillValueFromLevel("companies", 4)).toBe(6);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/skills/sp.test.ts src/skills/values.test.ts`  
Expected: FAIL (modules missing)

- [ ] **Step 3: Implement**

`src/skills/sp.ts`:

```ts
export function spCostForLevel(level: number): number {
  return level >= 1 ? level : 0;
}

export function totalSpToReachLevel(level: number): number {
  if (level <= 0) return 0;
  return (level * (level + 1)) / 2;
}

export function totalSpForLevels(levels: Record<string, number>): number {
  let sum = 0;
  for (const level of Object.values(levels)) {
    sum += totalSpToReachLevel(level);
  }
  return sum;
}
```

`src/skills/values.ts`:

```ts
export type EcoSkillId = "energy" | "entrepreneurship" | "production" | "companies";

export const ECO_SKILL_IDS: EcoSkillId[] = [
  "energy",
  "entrepreneurship",
  "production",
  "companies",
];

const TABLE: Record<EcoSkillId, { base: number; perLevel: number }> = {
  energy: { base: 30, perLevel: 10 },
  entrepreneurship: { base: 30, perLevel: 5 },
  production: { base: 10, perLevel: 3 },
  companies: { base: 2, perLevel: 1 },
};

export function skillValueFromLevel(skill: EcoSkillId, level: number): number {
  const row = TABLE[skill];
  return row.base + row.perLevel * Math.max(0, level);
}
```

`src/skills/index.ts` — re-export from `sp` and `values`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/skills/sp.test.ts src/skills/values.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/skills/sp.ts src/skills/sp.test.ts src/skills/values.ts src/skills/values.test.ts src/skills/index.ts
git commit -m "feat(skills): add SP cost curve and eco skill values"
```

---

### Task 2: Daily income math

**Files:**
- Create: `src/skills/income.ts`
- Create: `src/skills/income.test.ts`
- Modify: `src/skills/index.ts`

**Interfaces:**
- Consumes: `skillValueFromLevel`, `EcoSkillId`, `aeDailyValue` from `src/economy/profit.ts`
- Produces:
  - `export type SkillsCompany = { id: string; name: string; aeLevel: number; productionBonus: number; profitPerPp: number }`
  - `export type SkillsLevels = Record<EcoSkillId, number>`
  - `export type DailyIncomeBreakdown = { workGPerDay: number; selfWorkGPerDay: number; aeGPerDay: number; totalGPerDay: number; workActionsPerDay: number; selfWorkActionsPerDay: number; ppPerAction: number; activeSlots: number; selfWorkCompanyId: string | null; aeCompanyIds: string[] }`
  - `export function dailyActionsFromBar(value: number): number` — `(value / 10) * 2.4`
  - `export function pickBestSelfWorkCompany(companies: SkillsCompany[], productionValue: number): SkillsCompany | null`
  - `export function calculateDailyIncome(input: { levels: SkillsLevels; netWage: number; companies: SkillsCompany[]; selfWorkCompanyId?: string | null }): DailyIncomeBreakdown`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vite-plus/test";
import { calculateDailyIncome, dailyActionsFromBar } from "./income";

const cos = (id: string, ae: number, bonus: number, ppp: number) => ({
  id,
  name: id,
  aeLevel: ae,
  productionBonus: bonus,
  profitPerPp: ppp,
});

describe("dailyActionsFromBar", () => {
  it("uses 10% hourly regen over 24h", () => {
    expect(dailyActionsFromBar(40)).toBeCloseTo(9.6);
  });
});

describe("calculateDailyIncome", () => {
  it("matches work + self-work + capped AE", () => {
    const companies = [
      cos("a", 6, 0.5, 0.1),
      cos("b", 6, 0.5, 0.1),
      cos("c", 5, 0.5, 0.1),
    ];
    // companies value at level 0 = 2 → only top 2 AE companies
    const r = calculateDailyIncome({
      levels: { energy: 1, entrepreneurship: 1, production: 1, companies: 0 },
      netWage: 0.1,
      companies,
    });
    // energy L1 value 40 → actions 9.6; prod value 13; work = 9.6*13*0.1
    expect(r.ppPerAction).toBe(13);
    expect(r.workGPerDay).toBeCloseTo(9.6 * 13 * 0.1);
    expect(r.activeSlots).toBe(2);
    expect(r.aeCompanyIds).toHaveLength(2);
    expect(r.totalGPerDay).toBeCloseTo(r.workGPerDay + r.selfWorkGPerDay + r.aeGPerDay);
  });

  it("zeros work when netWage is 0", () => {
    const r = calculateDailyIncome({
      levels: { energy: 5, entrepreneurship: 0, production: 3, companies: 0 },
      netWage: 0,
      companies: [],
    });
    expect(r.workGPerDay).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/skills/income.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `income.ts`**

```ts
import { aeDailyValue } from "../economy/profit";
import { type EcoSkillId, skillValueFromLevel } from "./values";

export type SkillsLevels = Record<EcoSkillId, number>;

export type SkillsCompany = {
  id: string;
  name: string;
  aeLevel: number;
  productionBonus: number;
  profitPerPp: number;
};

export type DailyIncomeBreakdown = {
  workGPerDay: number;
  selfWorkGPerDay: number;
  aeGPerDay: number;
  totalGPerDay: number;
  workActionsPerDay: number;
  selfWorkActionsPerDay: number;
  ppPerAction: number;
  activeSlots: number;
  selfWorkCompanyId: string | null;
  aeCompanyIds: string[];
};

export function dailyActionsFromBar(value: number): number {
  return (value / 10) * 2.4;
}

function selfWorkGPerDayFor(
  company: SkillsCompany,
  selfWorkActions: number,
  ppPerAction: number,
): number {
  return (
    selfWorkActions * ppPerAction * (1 + company.productionBonus) * company.profitPerPp
  );
}

export function pickBestSelfWorkCompany(
  companies: SkillsCompany[],
  productionValue: number,
): SkillsCompany | null {
  if (companies.length === 0) return null;
  // productionValue only scales all equally; pick by (1+bonus)*profitPerPp
  let best = companies[0]!;
  let bestScore = (1 + best.productionBonus) * best.profitPerPp;
  for (let i = 1; i < companies.length; i++) {
    const c = companies[i]!;
    const score = (1 + c.productionBonus) * c.profitPerPp;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  void productionValue;
  return best;
}

export function calculateDailyIncome(input: {
  levels: SkillsLevels;
  netWage: number;
  companies: SkillsCompany[];
  selfWorkCompanyId?: string | null;
}): DailyIncomeBreakdown {
  const energy = skillValueFromLevel("energy", input.levels.energy);
  const entre = skillValueFromLevel("entrepreneurship", input.levels.entrepreneurship);
  const prod = skillValueFromLevel("production", input.levels.production);
  const companiesValue = skillValueFromLevel("companies", input.levels.companies);

  const workActionsPerDay = dailyActionsFromBar(energy);
  const selfWorkActionsPerDay = dailyActionsFromBar(entre);
  const ppPerAction = prod;

  const workGPerDay = workActionsPerDay * ppPerAction * Math.max(0, input.netWage);

  let selfCompany =
    input.selfWorkCompanyId != null
      ? (input.companies.find((c) => c.id === input.selfWorkCompanyId) ?? null)
      : null;
  if (!selfCompany) {
    selfCompany = pickBestSelfWorkCompany(input.companies, prod);
  }

  const selfWorkGPerDay = selfCompany
    ? selfWorkGPerDayFor(selfCompany, selfWorkActionsPerDay, ppPerAction)
    : 0;

  const ranked = input.companies
    .map((c) => ({
      id: c.id,
      daily: aeDailyValue(c.aeLevel, c.productionBonus, c.profitPerPp),
    }))
    .toSorted((a, b) => b.daily - a.daily);

  const activeSlots = Math.min(companiesValue, input.companies.length);
  const selected = ranked.slice(0, activeSlots);
  const aeGPerDay = selected.reduce((s, x) => s + x.daily, 0);

  return {
    workGPerDay,
    selfWorkGPerDay,
    aeGPerDay,
    totalGPerDay: workGPerDay + selfWorkGPerDay + aeGPerDay,
    workActionsPerDay,
    selfWorkActionsPerDay,
    ppPerAction,
    activeSlots,
    selfWorkCompanyId: selfCompany?.id ?? null,
    aeCompanyIds: selected.map((x) => x.id),
  };
}
```

Re-export from `index.ts`.

- [ ] **Step 4: Run tests**

Run: `vp test src/skills/income.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/skills/income.ts src/skills/income.test.ts src/skills/index.ts
git commit -m "feat(skills): add daily eco income breakdown"
```

---

### Task 3: Optimizers

**Files:**
- Create: `src/skills/optimize.ts`
- Create: `src/skills/optimize.test.ts`
- Modify: `src/skills/index.ts`

**Interfaces:**
- Consumes: `calculateDailyIncome`, `SkillsLevels`, `SkillsCompany`, `ECO_SKILL_IDS`, `spCostForLevel`
- Produces:
  - `export type OptimizeMode = "unspent" | "full_eco_reset"`
  - `export type OptimizeResult = { levels: SkillsLevels; totalGPerDay: number; deltaGPerDay: number }`
  - `export function optimizeEcoSkills(input: { mode: OptimizeMode; currentLevels: SkillsLevels; availableSkillPoints: number; totalSkillPoints: number; netWage: number; companies: SkillsCompany[]; selfWorkCompanyId?: string | null }): OptimizeResult`

Algorithm: greedy — while SP remains, try +1 level on each eco skill if affordable; pick max \(\Delta totalG / \Delta SP\); stop when no move fits.

- `unspent`: start at `currentLevels`; budget = `availableSkillPoints`
- `full_eco_reset`: start all eco at 0; budget = `totalSkillPoints`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vite-plus/test";
import { optimizeEcoSkills } from "./optimize";

const companies = [
  {
    id: "a",
    name: "a",
    aeLevel: 6,
    productionBonus: 0.5,
    profitPerPp: 0.1,
  },
];

describe("optimizeEcoSkills", () => {
  it("unspent never lowers levels", () => {
    const current = { energy: 3, entrepreneurship: 1, production: 2, companies: 0 };
    const r = optimizeEcoSkills({
      mode: "unspent",
      currentLevels: current,
      availableSkillPoints: 5,
      totalSkillPoints: 20,
      netWage: 0.12,
      companies,
    });
    for (const k of ["energy", "entrepreneurship", "production", "companies"] as const) {
      expect(r.levels[k]).toBeGreaterThanOrEqual(current[k]);
    }
  });

  it("full reset can zero non-starting eco and uses total SP budget", () => {
    const r = optimizeEcoSkills({
      mode: "full_eco_reset",
      currentLevels: { energy: 10, entrepreneurship: 10, production: 10, companies: 10 },
      availableSkillPoints: 0,
      totalSkillPoints: 15,
      netWage: 0.12,
      companies,
    });
    const spent =
      (r.levels.energy * (r.levels.energy + 1)) / 2 +
      (r.levels.entrepreneurship * (r.levels.entrepreneurship + 1)) / 2 +
      (r.levels.production * (r.levels.production + 1)) / 2 +
      (r.levels.companies * (r.levels.companies + 1)) / 2;
    expect(spent).toBeLessThanOrEqual(15);
    expect(r.totalGPerDay).toBeGreaterThan(0);
  });

  it("with 0 budget returns current income for unspent", () => {
    const current = { energy: 2, entrepreneurship: 1, production: 1, companies: 0 };
    const r = optimizeEcoSkills({
      mode: "unspent",
      currentLevels: current,
      availableSkillPoints: 0,
      totalSkillPoints: 10,
      netWage: 0.1,
      companies: [],
    });
    expect(r.levels).toEqual(current);
    expect(r.deltaGPerDay).toBeCloseTo(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/skills/optimize.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement greedy optimizer in `optimize.ts`**

```ts
import { calculateDailyIncome, type SkillsCompany, type SkillsLevels } from "./income";
import { spCostForLevel } from "./sp";
import { ECO_SKILL_IDS } from "./values";

export type OptimizeMode = "unspent" | "full_eco_reset";

export type OptimizeResult = {
  levels: SkillsLevels;
  totalGPerDay: number;
  deltaGPerDay: number;
};

function incomeFor(
  levels: SkillsLevels,
  netWage: number,
  companies: SkillsCompany[],
  selfWorkCompanyId?: string | null,
): number {
  return calculateDailyIncome({ levels, netWage, companies, selfWorkCompanyId }).totalGPerDay;
}

export function optimizeEcoSkills(input: {
  mode: OptimizeMode;
  currentLevels: SkillsLevels;
  availableSkillPoints: number;
  totalSkillPoints: number;
  netWage: number;
  companies: SkillsCompany[];
  selfWorkCompanyId?: string | null;
}): OptimizeResult {
  const baselineLevels: SkillsLevels =
    input.mode === "full_eco_reset"
      ? { energy: 0, entrepreneurship: 0, production: 0, companies: 0 }
      : { ...input.currentLevels };

  let budget =
    input.mode === "full_eco_reset" ? input.totalSkillPoints : input.availableSkillPoints;

  const baselineG = incomeFor(
    input.currentLevels,
    input.netWage,
    input.companies,
    input.selfWorkCompanyId,
  );

  let levels = { ...baselineLevels };

  while (budget > 0) {
    let bestSkill: (typeof ECO_SKILL_IDS)[number] | null = null;
    let bestScore = -Infinity;
    let bestCost = 0;

    for (const skill of ECO_SKILL_IDS) {
      const nextLevel = levels[skill] + 1;
      const cost = spCostForLevel(nextLevel);
      if (cost <= 0 || cost > budget) continue;
      const trial = { ...levels, [skill]: nextLevel };
      const delta =
        incomeFor(trial, input.netWage, input.companies, input.selfWorkCompanyId) -
        incomeFor(levels, input.netWage, input.companies, input.selfWorkCompanyId);
      const score = delta / cost;
      if (score > bestScore) {
        bestScore = score;
        bestSkill = skill;
        bestCost = cost;
      }
    }

    if (bestSkill == null) break;
    levels = { ...levels, [bestSkill]: levels[bestSkill] + 1 };
    budget -= bestCost;
  }

  const totalGPerDay = incomeFor(
    levels,
    input.netWage,
    input.companies,
    input.selfWorkCompanyId,
  );

  return {
    levels,
    totalGPerDay,
    deltaGPerDay: totalGPerDay - baselineG,
  };
}
```

Re-export from `index.ts`.

- [ ] **Step 4: Run tests**

Run: `vp test src/skills/optimize.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/skills/optimize.ts src/skills/optimize.test.ts src/skills/index.ts
git commit -m "feat(skills): add unspent and full eco reset optimizers"
```

---

### Task 4: Warera user + worker helpers and job wage resolve

**Files:**
- Create: `src/warera/users.ts`
- Create: `src/warera/users.test.ts`
- Create: `src/warera/workers.ts`
- Create: `src/warera/workers.test.ts`
- Create: `src/skills/job-wage.ts`
- Create: `src/skills/job-wage.test.ts`
- Modify: `src/warera/index.ts` (export new helpers)
- Modify: `src/skills/index.ts`

**Interfaces:**
- Produces:
  - `fetchUserLite(warera, userId)` → skills levels + leveling SP fields (parse defensively)
  - `fetchUserById(warera, userId)` → `{ companyId: string | null }`
  - `fetchWorkers(warera, { companyId?: string; userId?: string })` → `{ userId, wagePerPp }[]`
  - `fetchWorkOfferWage(warera, companyId)` → `number | null` fallback
  - `parseIncomeTaxRate(countryPayload: unknown): number` — probe `taxes.income` / `taxes.incomeTax` / `incomeTax` (percent→fraction if >1); default `0`
  - `resolveJobWage(warera, userId): Promise<SkillsJob>` where  
    `SkillsJob = { status: "resolved" | "unemployed" | "lookupFailed"; companyId?: string; grossWage?: number; incomeTaxRate?: number; netWage?: number }`

Wage resolve order:
1. `getUserById` → company id (also try `worker.getWorkers({ userId })` if company missing but workers returned)
2. No company and no worker row → `unemployed`
3. Gross from worker row matching userId; else `workOffer.getWorkOfferByCompanyId`
4. Load employer company → region/country → income tax via `parseIncomeTaxRate`
5. `netWage = gross * (1 - tax)`; on throw → `lookupFailed`

- [ ] **Step 1: Write failing unit tests for parsers + `resolveJobWage` with mocked `warera.request`**

Cover: resolved with tax; unemployed; lookupFailed; workOffer fallback.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `vp test src/warera/users.test.ts src/warera/workers.test.ts src/skills/job-wage.test.ts`

- [ ] **Step 3: Implement helpers**

Follow existing patterns in `src/warera/companies.ts` / `search.ts`:
`warera.request(wareraProcedurePath(...))` + `unwrapTrpcData`.

For `fetchUserLite`, return:

```ts
export type UserLiteSkills = {
  userId: string;
  username: string;
  leveling: {
    level: number;
    availableSkillPoints: number;
    spentSkillPoints: number;
    totalSkillPoints: number;
  };
  skillLevels: Record<string, number>; // skill key → level
  skillValues: Record<string, number>; // skill key → value/total for display
};
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/warera/users.ts src/warera/users.test.ts src/warera/workers.ts src/warera/workers.test.ts src/warera/index.ts src/skills/job-wage.ts src/skills/job-wage.test.ts src/skills/index.ts
git commit -m "feat(skills): resolve job net wage from workers API"
```

---

### Task 5: Skills bootstrap DTO

**Files:**
- Create: `src/skills/bootstrap.ts`
- Create: `src/skills/bootstrap.test.ts`
- Modify: `src/skills/index.ts`

**Interfaces:**
- Consumes: `loadCompanyPackForUser`, `getLatestPrices` / `marketPriceMap`, `calculateProfitPerPp`, `fetchUserLite`, `resolveJobWage`, `aeDailyValue` inputs
- Produces:
  - `SkillsBootstrapCompany = { id, name, aeLevel, itemCode, productionBonus, profitPerPp }`
  - `SkillsBootstrapResponse = { recordedAt, companiesFetchedAt, companiesRefreshed, leveling, skills: { level, value } by key, companies, job: SkillsJob }`
  - `mapSkillsBootstrap(...)` pure
  - `buildSkillsBootstrap({ db, warera, logger, userId, refresh? })`

Parallel in `buildSkillsBootstrap`:
1. `loadCompanyPackForUser` (+ prices like growth if needed for Profit/PP)
2. `fetchUserLite`
3. `resolveJobWage`

`profitPerPp` per company from prices + `calculateProfitPerPp`; `productionBonus` default 0 if null for math (or skip company with 0 income).

- [ ] **Step 1: Write `mapSkillsBootstrap` unit tests** (pack entries + prices + lite + job → DTO)

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/skills/bootstrap.test.ts`

- [ ] **Step 3: Implement mapper + `buildSkillsBootstrap`** (mirror `src/growth/bootstrap.ts` structure)

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/skills/bootstrap.ts src/skills/bootstrap.test.ts src/skills/index.ts
git commit -m "feat(skills): add skills bootstrap payload builder"
```

---

### Task 6: Hono route `/api/skills/bootstrap`

**Files:**
- Create: `src/server/routes/skills.ts`
- Create: `src/server/routes/skills.test.ts`
- Modify: `src/server/app.ts` — `app.route("/api/skills", skillsRoutes(...))`

**Interfaces:**
- Same shape as growth route: `userId` required; `refresh=1|true`; 502 on upstream errors via `HttpError`

- [ ] **Step 1: Write route tests** (400 without userId; 200 returns leveling + companies + job.status; refresh forwarded)

Mirror `src/server/routes/growth.test.ts` (in-memory db + mocked warera).

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/server/routes/skills.test.ts`

- [ ] **Step 3: Implement route + mount in `app.ts`**

```ts
// skills.ts — copy growthRoutes pattern calling buildSkillsBootstrap
// app.ts — app.route("/api/skills", skillsRoutes({ db, warera, logger }));
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/skills.ts src/server/routes/skills.test.ts src/server/app.ts
git commit -m "feat(skills): expose GET /api/skills/bootstrap"
```

---

### Task 7: Web query layer + shell Load invalidation

**Files:**
- Modify: `src/web/query/keys.ts`
- Create: `src/web/query/fetchSkillsBootstrap.ts`
- Create: `src/web/query/fetchSkillsBootstrap.test.ts`
- Create: `src/web/query/useSkillsBootstrapQuery.ts`
- Modify: `src/web/query/loadPlayerData.ts`
- Modify: `src/web/query/loadPlayerData.test.ts` (if present; else extend)

**Interfaces:**
- `queryKeys.skillsBootstrap(userId) => ["skills-bootstrap", userId]`
- `skillsBootstrapPath` / `fetchSkillsBootstrap` like growth
- `useSkillsBootstrapQuery(userId)` enabled when userId set
- `loadPlayerData` also `invalidateQueries({ queryKey: queryKeys.skillsBootstrap(userId) })`

- [ ] **Step 1: Write fetch path tests** (encode userId, refresh flag)

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/web/query/fetchSkillsBootstrap.test.ts`

- [ ] **Step 3: Implement fetch, hook, keys, loadPlayerData invalidation**

- [ ] **Step 4: Run related query tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/web/query/keys.ts src/web/query/fetchSkillsBootstrap.ts src/web/query/fetchSkillsBootstrap.test.ts src/web/query/useSkillsBootstrapQuery.ts src/web/query/loadPlayerData.ts src/web/query/loadPlayerData.test.ts
git commit -m "feat(web): add skills bootstrap query and Load invalidation"
```

---

### Task 8: Skills page UI + route + nav

**Files:**
- Create: `src/web/lib/skillsSearch.ts` (+ test optional; copy growthSearch)
- Create: `src/web/routes/skills.tsx`
- Create: `src/web/features/skills/types.ts`
- Create: `src/web/features/skills/SkillsPage.tsx`
- Create: `src/web/features/skills/SkillRail.tsx` (or inline if small)
- Create: `src/web/features/skills/IncomeStack.tsx`
- Modify: `src/web/layout/Shell.tsx` — add `{ to: "/skills", label: "Skills" }` near Companies/Growth

**UI behavior (layout C):**
- Shell player + `useSyncPlayerSearch` + `useSkillsBootstrapQuery`
- Seed draft eco levels from bootstrap; Reset restores
- Draft SP: non-eco levels fixed at loaded costs; eco +/− clamped so `totalSpForLevels(eco) <= totalSkillPoints - spentNonEco`
- Show cost to next level via `spCostForLevel(level+1)`
- Hero `totalGPerDay` + Δ vs loaded
- Cards: Work / Self-work / AE with short formulas (reuse Companies `FormulaBox` style if useful)
- Editable net wage (seed from `job.netWage ?? 0`); self-work company `<select>`
- Buttons: Optimize unspent / Full eco reset → apply `optimizeEcoSkills` to draft
- Job status warnings for unemployed / lookupFailed

- [ ] **Step 1: Add route + search helpers + Shell nav link**

- [ ] **Step 2: Implement SkillsPage wiring bootstrap → draft → `calculateDailyIncome`**

Client imports from `@/skills` (ensure tsconfig paths allow like `@/growth`).

- [ ] **Step 3: Manual smoke**

Run: `vp run dev` (or project dev script), open `/skills`, Load a player, tweak levels, run both optimizers, Reset.

- [ ] **Step 4: `vp check` + `vp test src/skills src/server/routes/skills.test.ts src/web/query/fetchSkillsBootstrap.test.ts`**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/web/lib/skillsSearch.ts src/web/routes/skills.tsx src/web/features/skills src/web/layout/Shell.tsx
git commit -m "feat(web): add Skills optimizer page"
```

- [ ] **Step 6: Document confirmed income-tax field path in `.agents/skills/warera-game-mechanics/companies.md` (or glossary) if discovered during Task 4**

```bash
git add .agents/skills/warera-game-mechanics/
git commit -m "docs(mechanics): note wage income tax field for skills optimizer"
```

(Skip this commit if tax field remains default 0 / unconfirmed.)

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| `/skills` page + Skills nav | 8 |
| SP cost \(n\) / triangular total | 1 |
| Skill values table | 1 |
| Work / self-work / AE income | 2 |
| Companies Limit capped to owned | 2 |
| Best self-work company | 2 |
| Optimize unspent | 3 |
| Full eco reset | 3 |
| No Management in optimize | 3 (ECO_SKILL_IDS only) |
| Job wage resolve + editable | 4, 8 |
| Bootstrap API | 5, 6 |
| Shell player + refresh invalidation | 7, 8 |
| Layout C UI + breakdowns | 8 |
| Unit + route tests | 1–7 |

## Placeholder / consistency notes

- Income tax field name is probed at runtime (`parseIncomeTaxRate`); default 0 until confirmed — not a TBD in product behavior (UI override covers gaps).
- Type names `SkillsLevels`, `SkillsJob`, `SkillsBootstrapResponse` are stable across tasks 2–8.
- Greedy optimizer is the v1 algorithm; upgrade to DP only if a test finds a clear suboptimality.
