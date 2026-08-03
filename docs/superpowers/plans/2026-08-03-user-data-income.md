# User Data + Growth Income Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/user` as the User-tier SoT (raw player/companies/job/skills + computed split income), cache it in TanStack Query, migrate Skills onto it, and fold work/self-work into Growth while keeping AE-all-factories + Extra gold.

**Architecture:** Pure User mapper in `src/user/` reuses `src/skills/income.ts` and job-wage resolve. Client `queryKeys.user` becomes the shared cache. Growth planner side income becomes `{ work, selfWork, extra }`; thin growth bootstrap drops companies. Skills bootstrap endpoint is removed.

**Tech Stack:** TypeScript, Hono, Vitest via `vp test`, Vite+ (`vp check`), TanStack Query, existing WarEra pack/lite helpers.

**Design:** [2026-08-03-user-data-income-design.md](../specs/2026-08-03-user-data-income-design.md)

## Global Constraints

- User payload = raw WarEra-derived fields + computed `income` (Skills formulas, including Companies slots for `aeGPerDay`)
- Growth AE math stays all owned factories (no slot capping)
- Growth daily gold = AE sum + work + selfWork + Extra gold
- Extra gold remains client-only residual
- No Eco/Sustain mode on Growth
- Skills page recomputes from raw User fields; server `income` is default baseline
- Remove `/api/skills/bootstrap` in this slice
- Growth bootstrap no longer returns `companies[]` or income
- Prefer `vp test path/to/file.test.ts` and `vp check` for verification
- Commit after each task

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/user/types.ts` | `UserResponse` and related types |
| `src/user/map.ts` | Pure `mapUser` from lite + pack + job + prices |
| `src/user/map.test.ts` | Mapper + income tests |
| `src/user/build.ts` | Async `buildUser` (pack, lite, job, prices) |
| `src/user/index.ts` | Public exports |
| `src/server/routes/user.ts` | `GET /` → `/api/user` |
| `src/server/routes/user.test.ts` | Route contract tests |
| `src/server/app.ts` | Mount `/api/user` |
| `src/web/query/keys.ts` | Add `user`, remove `skillsBootstrap` |
| `src/web/query/fetchUser.ts` | Path + fetch helper |
| `src/web/query/useUserQuery.ts` | TanStack hook |
| `src/web/query/loadPlayerData.ts` | Invalidate/refetch user |
| `src/web/features/skills/*` | Consume User instead of skills bootstrap |
| `src/skills/bootstrap.ts` + route | Delete after migration |
| `src/growth/income.ts` + `plan.ts` | Side income object |
| `src/growth/bootstrap.ts` | Thin price/opportunities payload |
| `src/web/features/growth/*` | User companies + work/selfWork + Extra |

---

### Task 1: User mapper (pure) + income

**Files:**
- Create: `src/user/types.ts`
- Create: `src/user/map.ts`
- Create: `src/user/map.test.ts`
- Create: `src/user/index.ts`

**Interfaces:**
- Consumes: `calculateDailyIncome`, `SkillsLevels`, `SkillsCompany` from `src/skills/income.ts`; `SkillsJob` from `src/skills/job-wage.ts`; `UserLiteSkills` from `src/warera/users.ts`; `CompanyPackEntry` from `src/db/company-packs.ts`; `calculateProfitPerPp` from `src/economy/profit.ts`; `goldPerAePerDayFromProfit` from `src/growth/income.ts`
- Produces:
  - `UserSkill = { level: number; value: number }`
  - `UserCompany = { id, name, aeLevel, itemCode, productionBonus, profitPerPp, goldPerAePerDay }`
  - `UserIncome` = `DailyIncomeBreakdown` fields (same shape as Skills)
  - `UserResponse` with `userId`, `username`, meta, `leveling`, `skills`, `job`, `companies`, `income`
  - `export function mapUser(input: MapUserInput): UserResponse`

- [ ] **Step 1: Write failing mapper tests**

`src/user/map.test.ts` — use empty `packEntries` for deterministic work math (no Profit/PP dependency). Separately assert company mapping when `calculateProfitPerPp` returns null → `profitPerPp: 0`.

```ts
import { describe, expect, it } from "vite-plus/test";
import { mapUser } from "./map";
import type { MapUserInput } from "./map";

function baseInput(over: Partial<MapUserInput> = {}): MapUserInput {
  return {
    userId: "u1",
    recordedAt: "2026-08-03T00:00:00.000Z",
    companiesFetchedAt: 1,
    companiesRefreshed: false,
    lite: {
      userId: "u1",
      username: "Ada",
      leveling: {
        level: 10,
        availableSkillPoints: 5,
        spentSkillPoints: 15,
        totalSkillPoints: 20,
      },
      skillLevels: { energy: 1, entrepreneurship: 1, production: 1, companies: 0 },
      skillValues: { energy: 40, entrepreneurship: 35, production: 13, companies: 2 },
    },
    job: {
      status: "resolved",
      companyId: "job1",
      grossWage: 0.12,
      incomeTaxRate: 0.1,
      netWage: 0.1,
    },
    packEntries: [],
    prices: {},
    ...over,
  };
}

describe("mapUser", () => {
  it("maps identity/skills/job and computes work income", () => {
    const result = mapUser(baseInput());
    expect(result.username).toBe("Ada");
    expect(result.skills.energy?.level).toBe(1);
    expect(result.job.netWage).toBe(0.1);
    // energy L1 → value 40 via skillValueFromLevel; actions 9.6; prod 13
    expect(result.income.workGPerDay).toBeCloseTo(9.6 * 13 * 0.1);
    expect(result.income.selfWorkGPerDay).toBe(0);
    expect(result.income.aeGPerDay).toBe(0);
    expect(result.income.totalGPerDay).toBeCloseTo(result.income.workGPerDay);
  });

  it("zeros work when unemployed", () => {
    const result = mapUser(baseInput({ job: { status: "unemployed" } }));
    expect(result.income.workGPerDay).toBe(0);
  });

  it("maps companies with zero profit when prices missing", () => {
    const result = mapUser(
      baseInput({
        packEntries: [
          {
            id: "a",
            name: "A",
            aeLevel: 6,
            itemCode: "iron",
            productionBonus: 0.5,
            regionId: null,
            bonusDetails: null,
          },
        ],
        prices: {},
      }),
    );
    expect(result.companies).toEqual([
      {
        id: "a",
        name: "A",
        aeLevel: 6,
        itemCode: "iron",
        productionBonus: 0.5,
        profitPerPp: 0,
        goldPerAePerDay: 0,
      },
    ]);
    expect(result.income.aeGPerDay).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/user/map.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement types + mapper**

`src/user/types.ts` — define `UserSkill`, `UserCompany`, `UserIncome` (= same fields as `DailyIncomeBreakdown`), and `UserResponse`.

`src/user/map.ts` — implement `mapUser`:

1. Map skills like `mapSkills` in `src/skills/bootstrap.ts`.
2. Map companies with `profitPerPp` via `calculateProfitPerPp` (0 if missing) and `goldPerAePerDay` via `goldPerAePerDayFromProfit` when bonus + ppp valid, else 0.
3. Build `SkillsLevels` from `skills.*.level` (default 0 for missing eco skills).
4. Call `calculateDailyIncome({ levels, netWage: job.netWage ?? 0, companies })`.
5. Return full `UserResponse`.

`src/user/index.ts` — re-export types + `mapUser`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/user/map.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/user/types.ts src/user/map.ts src/user/map.test.ts src/user/index.ts
git commit -m "$(cat <<'EOF'
feat(user): add pure User mapper with computed income

EOF
)"
```

---

### Task 2: `buildUser` + `GET /api/user`

**Files:**
- Create: `src/user/build.ts`
- Create: `src/server/routes/user.ts`
- Create: `src/server/routes/user.test.ts`
- Modify: `src/server/app.ts`
- Modify: `src/user/index.ts`

**Interfaces:**
- Consumes: `mapUser`; `loadCompanyPackForUser`; `fetchUserLite`; `resolveJobWage`; `getLatestPrices` / `marketPriceMap`; `runPricePoll` (same pattern as `buildSkillsBootstrap`)
- Produces: `buildUser(options) => Promise<UserResponse>`; Hono `userRoutes` mounted at `/api/user` with `GET /?userId=&refresh=`

- [ ] **Step 1: Write failing route test**

Mirror `src/server/routes/skills.test.ts` structure: in-memory DB, seed prices + company pack, mock WarEra for lite + job paths, assert JSON includes `skills`, `job`, `companies`, `income.workGPerDay`, `income.aeGPerDay`.

Also assert `400` when `userId` missing.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/server/routes/user.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement `buildUser` + route + mount**

`src/user/build.ts` — copy the parallel fetch pattern from `buildSkillsBootstrap`, then `return mapUser({...})`.

`src/server/routes/user.ts`:

```ts
app.get("/", async (c) => {
  const userId = (c.req.query("userId") ?? "").trim();
  if (!userId) throw new HttpError(400, "invalid_query", "userId is required");
  const refreshRaw = (c.req.query("refresh") ?? "").trim().toLowerCase();
  const refresh = refreshRaw === "1" || refreshRaw === "true";
  try {
    return c.json(await buildUser({ db, warera, logger, userId, refresh }));
  } catch (err) {
    throw new HttpError(
      502,
      "upstream_error",
      err instanceof Error ? err.message : "User load failed",
    );
  }
});
```

Mount in `src/server/app.ts`: `app.route("/api/user", userRoutes(...))`.

- [ ] **Step 4: Run tests**

Run: `vp test src/server/routes/user.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/user/build.ts src/user/index.ts src/server/routes/user.ts src/server/routes/user.test.ts src/server/app.ts
git commit -m "$(cat <<'EOF'
feat(user): expose GET /api/user bootstrap

EOF
)"
```

---

### Task 3: TanStack `useUserQuery` + shell Load

**Files:**
- Create: `src/web/query/fetchUser.ts`
- Create: `src/web/query/fetchUser.test.ts`
- Create: `src/web/query/useUserQuery.ts`
- Modify: `src/web/query/keys.ts`
- Modify: `src/web/query/loadPlayerData.ts`
- Modify: `src/web/query/loadPlayerData.test.ts`

**Interfaces:**
- Produces:
  - `queryKeys.user(userId) => ["user", userId]`
  - `userPath(userId, refresh)`, `fetchUser(userId, refresh)`
  - `useUserQuery(userId: string | null)`
  - `loadPlayerData` refetches/invalidates user (with refresh) and growth; keeps companies advisor refresh; stops relying on skills bootstrap once Task 4 removes it (for this task: add user invalidation alongside existing keys)

- [ ] **Step 1: Write failing path + loadPlayerData tests**

`fetchUser.test.ts` — assert `/api/user?userId=u1` and `&refresh=1`.

Update `loadPlayerData.test.ts` to expect a fetch/invalidate for `queryKeys.user("u1")` (pattern: after load, user key is invalidated or fetched with refresh — match whatever implementation you choose; prefer `fetchQuery` with `refresh=1` for user, then invalidate growth).

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/web/query/fetchUser.test.ts src/web/query/loadPlayerData.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement fetch/hook/keys/load**

```ts
// keys.ts
user: (userId: string) => ["user", userId] as const,

// loadPlayerData.ts (target end-state after Task 4; for now keep skillsBootstrap invalidate too)
export async function loadPlayerData(queryClient: QueryClient, userId: string): Promise<void> {
  await queryClient.fetchQuery({
    queryKey: queryKeys.companies(userId),
    queryFn: () => fetchAdvisor(userId, true),
  });
  await queryClient.fetchQuery({
    queryKey: queryKeys.user(userId),
    queryFn: () => fetchUser(userId, true),
  });
  await queryClient.invalidateQueries({ queryKey: queryKeys.growthBootstrap(userId) });
  await queryClient.invalidateQueries({ queryKey: queryKeys.skillsBootstrap(userId) });
}
```

- [ ] **Step 4: Run tests**

Run: `vp test src/web/query/fetchUser.test.ts src/web/query/loadPlayerData.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/web/query/keys.ts src/web/query/fetchUser.ts src/web/query/fetchUser.test.ts src/web/query/useUserQuery.ts src/web/query/loadPlayerData.ts src/web/query/loadPlayerData.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add TanStack user query and Load wiring

EOF
)"
```

---

### Task 4: Migrate Skills to User; remove skills bootstrap

**Files:**
- Modify: `src/web/features/skills/SkillsPage.tsx`
- Modify: `src/web/features/skills/types.ts`
- Delete: `src/web/query/useSkillsBootstrapQuery.ts`
- Delete: `src/web/query/fetchSkillsBootstrap.ts`
- Delete: `src/web/query/fetchSkillsBootstrap.test.ts`
- Modify: `src/web/query/keys.ts` — remove `skillsBootstrap`
- Modify: `src/web/query/loadPlayerData.ts` — remove skills bootstrap invalidate
- Modify: `src/web/query/loadPlayerData.test.ts`
- Delete: `src/server/routes/skills.ts`, `src/server/routes/skills.test.ts`
- Modify: `src/server/app.ts` — unmount `/api/skills`
- Delete or stop exporting: `src/skills/bootstrap.ts`, `src/skills/bootstrap.test.ts`; remove bootstrap exports from `src/skills/index.ts`

**Interfaces:**
- Skills page consumes `UserResponse` via `useUserQuery`
- `ecoLevelsFromBootstrap` → rename to `ecoLevelsFromUser` reading `UserResponse["skills"]`
- Keep client `calculateDailyIncome` / optimize unchanged

- [ ] **Step 1: Point SkillsPage at `useUserQuery`**

Replace `useSkillsBootstrapQuery` + `SkillsBootstrapResponse` with `useUserQuery` + `UserResponse`. Keep the same apply/draft-level UX; only the data source changes. Update `types.ts` to re-export User types needed by the page (or import from `@/user`).

- [ ] **Step 2: Remove skills bootstrap API + client helpers**

Delete files listed above; unmount route; scrub exports and query keys; fix `loadPlayerData` tests.

- [ ] **Step 3: Run focused tests + typecheck surface**

Run:

```bash
vp test src/web/query/loadPlayerData.test.ts src/skills/income.test.ts src/skills/optimize.test.ts src/user/map.test.ts src/server/routes/user.test.ts
vp check
```

Expected: PASS (fix any leftover imports)

- [ ] **Step 4: Commit**

```bash
git add -A src/web/features/skills src/web/query src/server src/skills
git commit -m "$(cat <<'EOF'
refactor(skills): consume /api/user and drop skills bootstrap

EOF
)"
```

---

### Task 5: Growth side income in pure planner

**Files:**
- Modify: `src/growth/income.ts`
- Modify: `src/growth/income.test.ts`
- Modify: `src/growth/plan.ts`
- Modify: `src/growth/plan.test.ts`

**Interfaces:**
- Produces:
  - `export type GrowthSideIncome = { workGPerDay: number; selfWorkGPerDay: number; extraGoldPerDay: number }`
  - `export function sideIncomeTotal(side: GrowthSideIncome): number`
  - `dailyGoldFromFactories(factories, side: GrowthSideIncome): number` — AE sum + `sideIncomeTotal(side)`
  - `hourlyGoldFromFactories(factories, side: GrowthSideIncome): number`
  - `GrowthPlanInput.sideIncome: GrowthSideIncome` (replace `extraGoldPerDay`)

- [ ] **Step 1: Write failing income/plan tests**

```ts
describe("dailyGoldFromFactories", () => {
  it("adds work + selfWork + extra on top of AE", () => {
    const factories = [{ id: "a", aeLevel: 2, goldPerAePerDay: 3 }];
    expect(
      dailyGoldFromFactories(factories, {
        workGPerDay: 10,
        selfWorkGPerDay: 5,
        extraGoldPerDay: 1,
      }),
    ).toBeCloseTo(2 * 3 + 10 + 5 + 1);
  });
});
```

Update every `planGrowthPath({ ..., extraGoldPerDay: 0 })` call to:

```ts
sideIncome: { workGPerDay: 0, selfWorkGPerDay: 0, extraGoldPerDay: 0 }
```

Add one plan test where `workGPerDay > 0` reduces time-to-goal vs zero side income (same factories/wallet/prices/goal).

- [ ] **Step 2: Run tests to verify failures**

Run: `vp test src/growth/income.test.ts src/growth/plan.test.ts`

Expected: FAIL on new signature / assertion

- [ ] **Step 3: Implement signature change through `income.ts` and `plan.ts`**

Replace all `extraGoldPerDay` parameters in planner internals with `GrowthSideIncome`. Do not change AE factory summing logic.

- [ ] **Step 4: Run tests**

Run: `vp test src/growth/income.test.ts src/growth/plan.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/growth/income.ts src/growth/income.test.ts src/growth/plan.ts src/growth/plan.test.ts
git commit -m "$(cat <<'EOF'
feat(growth): model work/self-work/extra as side income

EOF
)"
```

---

### Task 6: Thin growth bootstrap (no companies)

**Files:**
- Modify: `src/growth/bootstrap.ts`
- Modify: `src/growth/bootstrap.test.ts`
- Modify: `src/server/routes/growth.test.ts`
- Modify: `src/web/features/growth/types.ts` (if it re-exports company types)

**Interfaces:**
- `GrowthBootstrapResponse` becomes:
  - `recordedAt`
  - `prices: { steel, concrete }`
  - `bestItem: { itemCode, profitPerPp, suggestedBonus } | null` — `suggestedBonus` default `0` (Growth page averages User company bonuses client-side)
  - `opportunitiesLite`
  - `startBalance`, `steel`, `concrete` (still 0 defaults)
- Remove: `companies`, `companiesFetchedAt`, `companiesRefreshed`
- `buildGrowthBootstrap` no longer calls `loadCompanyPackForUser` (prices only; optional `userId` unused for pack — keep query param for API stability or drop if tests allow; prefer keep `userId` required for now even if unused, OR make it optional — **keep required** to avoid breaking route validation patterns, but do not load pack)

- [ ] **Step 1: Update bootstrap unit/route tests for thin shape**

Assert response has no `companies` key (or `companies` undefined). Assert opportunities/prices/bestItem still present. Remove pack-dependent company expectations.

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/growth/bootstrap.test.ts src/server/routes/growth.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement thin `mapGrowthBootstrap` / `buildGrowthBootstrap`**

Only prices + opportunities. `bestItem.suggestedBonus = 0`.

- [ ] **Step 4: Run tests**

Run: `vp test src/growth/bootstrap.test.ts src/server/routes/growth.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/growth/bootstrap.ts src/growth/bootstrap.test.ts src/server/routes/growth.test.ts src/web/features/growth/types.ts
git commit -m "$(cat <<'EOF'
refactor(growth): thin bootstrap to prices and opportunities

EOF
)"
```

---

### Task 7: Growth page — User companies + work/self-work UI

**Files:**
- Modify: `src/web/features/growth/GrowthPage.tsx`
- Modify: `src/web/features/growth/types.ts` as needed
- Modify: `AGENTS.md` User-tier bullet if it still says only company pack
- Optional one-line notes in Skills/Growth design specs pointing at the User design (keep short)

**Interfaces:**
- Page uses `useUserQuery` + `useGrowthBootstrapQuery`
- Factories initialized from `user.companies` (`id`, `name`, `itemCode`, `aeLevel`, `goldPerAePerDay`)
- `sideIncome = { workGPerDay: user.income.workGPerDay, selfWorkGPerDay: user.income.selfWorkGPerDay, extraGoldPerDay }`
- Bonus default: average of user company `productionBonus` (fallback 0), not bootstrap `suggestedBonus`
- Gate planner until both User and growth context ready
- UI: show read-only Work G/day and Self-work G/day; keep Extra gold editable

- [ ] **Step 1: Wire data sources and planner input**

Replace `companiesToEditable(bootstrap)` with mapping from `UserResponse.companies`. Pass `sideIncome` into `planGrowthPath`. Initialize/reapply factories when user query updates (same pattern as current bootstrap apply).

- [ ] **Step 2: Add read-only work/self-work controls beside Extra gold**

Use the same numeric display style as Extra gold (`formatGold` if available). Labels: “Work G/day”, “Self-work G/day”, “Extra G/day”.

- [ ] **Step 3: Manual sanity + automated checks**

Run:

```bash
vp test src/growth/income.test.ts src/growth/plan.test.ts src/growth/bootstrap.test.ts src/user/map.test.ts src/web/query/loadPlayerData.test.ts
vp check
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/web/features/growth AGENTS.md docs/superpowers/specs/2026-08-03-skills-optimizer-design.md docs/superpowers/specs/2026-08-02-factory-growth-planner-design.md docs/superpowers/specs/2026-08-02-data-tier-caching-strategy-design.md
git commit -m "$(cat <<'EOF'
feat(growth): use User income for work and self-work

EOF
)"
```

(Only stage spec files you actually edit.)

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| `GET /api/user` raw + computed income | 1–2 |
| TanStack `queryKeys.user` + shell Load | 3 |
| Skills migrates; remove skills bootstrap | 4 |
| Growth AE unchanged | 5–7 (no slot logic added) |
| Growth + work/selfWork/extra | 5, 7 |
| Thin growth bootstrap | 6 |
| Extra gold client-only | 7 |
| Soft-fail job / missing PPP | 1 (mapper), 2 (route mirrors Skills) |
| Docs / data-tier note | 7 |

## Self-review notes

- No TBD placeholders left in tasks.
- `GrowthPlanInput.sideIncome` naming is consistent across Tasks 5 and 7.
- `UserResponse.income` reuses Skills breakdown field names (`workGPerDay`, etc.).
- Companies/advisor migration intentionally omitted.
