# User Data + Growth Income — Design

**Date:** 2026-08-03  
**Status:** Approved for implementation  
**Depends on:** [Data Tier Caching](./2026-08-02-data-tier-caching-strategy-design.md), [Skills Optimizer](./2026-08-03-skills-optimizer-design.md), [Factory Growth Planner](./2026-08-02-factory-growth-planner-design.md)  
**Supersedes (partially):** Skills bootstrap as the User SoT; Growth’s AE-only + flat Extra gold as the sole income model

## Goal

Introduce a shared **User-tier** API resource that carries selected-player identity, owned companies, job, skills, and **known income sources** (raw WarEra-backed fields plus a computed daily breakdown).

Tools then:

- **Skills** — still recompute and optimize from raw User fields.
- **Growth** — keep existing AE factory math (all owned companies), and add work + self-work from User computed income, plus a manual Extra gold residual.

There is **no** Eco/Sustain mode on Growth. Formulas are the same for every build; Extra gold covers residual incomes (gov positions, ranking chests, etc.).

## Decisions

| Topic | Choice |
| --- | --- |
| Approach | User SoT + thin tool bootstraps (not fat User with Global prices) |
| Endpoint | `GET /api/user?userId=&refresh=` |
| Client cache | TanStack Query `queryKeys.user(userId)`; shell Load/Refresh owns refresh |
| Payload style | Raw WarEra-derived fields + computed convenience fields (split income) |
| Income math | Reuse Skills pure module (`calculateDailyIncome` / equivalent) on the server for defaults |
| Growth AE | **Unchanged** — sum all owned factories (ignore Companies slots in the planner) |
| Growth work/self-work | From User `income` (constant over a sim); skills do not change during the path |
| Extra gold | Client-only editable residual; not stored on User in this slice |
| Skills bootstrap | Migrate Skills page to User; **remove** `/api/skills/bootstrap` in this slice |
| Growth bootstrap | Thin to prices / bestItem / opportunities / wallet defaults (no companies/income) |
| Companies / advisor | Out of scope — stays on `/api/economy/advisor` for now |
| Workers / Management | Out of scope |

## Architecture

```
Shell Load/Refresh
       │
       ▼
GET /api/user?userId=&refresh=1
       │  company pack TTL/bust · user.getUserLite · job wage · prices for Profit/PP
       ▼
TanStack Query: queryKeys.user(userId)
       │
       ├─► Skills  — raw skills/job/companies → client income + optimize
       ├─► Growth  — work/selfWork from income (+ Extra gold); AE planner unchanged
       └─► later   — Companies may share companies[] without advisor fat

GET /api/growth/...           — prices, bestItem, opportunitiesLite, wallet defaults
GET /api/economy/advisor      — Companies switch/payback (not User SoT)
```

### Module layout

| Area | Location |
| --- | --- |
| User builder + types | `src/user/` (build from pack + lite + job + income) |
| Shared income math | Keep `src/skills/income.ts` this slice (User builder imports it); optional later move to `src/income/` |
| Job wage resolve | Existing Skills server helper — called from User builder |
| Hono route | `/api/user` |
| Client | `fetchUser`, `useUserQuery`, update `loadPlayerData` |

## User payload

`GET /api/user?userId=&refresh=`

| Block | Contents |
| --- | --- |
| Meta | `recordedAt`, `companiesFetchedAt`, `companiesRefreshed` |
| Identity | `userId`; `username` when available cheaply from lite |
| `leveling` | From `user.getUserLite` (same as Skills today) |
| `skills` | Per-skill `{ level, value }` (raw) |
| `job` | `{ status, companyId?, grossWage?, incomeTaxRate?, netWage? }` — `resolved` \| `unemployed` \| `lookupFailed` |
| `companies[]` | `id`, `name`, `aeLevel`, `itemCode`, `productionBonus`, `profitPerPp`; optional convenience `goldPerAePerDay` |
| `income` | Computed default situation (see below) |

### Computed `income`

Default situation using the same formulas as Skills:

```
workGPerDay
selfWorkGPerDay
aeGPerDay          // Companies skill slots: top N by AE daily value
totalGPerDay

// meta
workActionsPerDay
selfWorkActionsPerDay
ppPerAction
activeSlots
selfWorkCompanyId
aeCompanyIds
```

- Unemployed / no wage → `workGPerDay = 0`.
- Self-work company defaults to best owned company (same as Skills).
- Missing Profit/PP or bonus → that company contributes 0.

Clients that edit levels or wage **recompute** from raw fields; server `income` is the default baseline / display seed.

## Growth income model

Planner daily gold:

```
dailyGold = Σ (aeLevel_i × goldPerAePerDay_i)   // all factories — existing behavior
          + workGPerDay + selfWorkGPerDay       // from User.income (fixed for the sim)
          + extraGoldPerDay                     // manual UI residual
```

- Work / self-work do not change as factories are bought or upgraded.
- AE path ranking / slot policy stays Skills-only (and User `income.aeGPerDay`); Growth does not adopt slot capping.
- Derive planner factories from User `companies` (use `goldPerAePerDay` or recompute from profit/bonus). New factories still use growth context `bestItem` / bonus.
- Growth bootstrap no longer returns `companies[]` or income fields.

### Growth UI

- Show work / self-work from User as read-only in this slice.
- Keep editable Extra gold for residual incomes.
- No Eco/Sustain toggle.

## Skills migration

- Skills page uses `useUserQuery` instead of `/api/skills/bootstrap`.
- Keep client `calculateDailyIncome` / optimize on raw User fields.
- Remove `/api/skills/bootstrap` so shell load does not maintain two User caches.

## Client cache & shell Load

| Key | Role |
| --- | --- |
| `queryKeys.user(userId)` | User SoT |
| `queryKeys.companies(userId)` | Advisor (unchanged this slice) |
| `queryKeys.growthBootstrap(userId)` | Thin growth context only |
| `queryKeys.skillsBootstrap` | Remove after Skills migrates |

`loadPlayerData`:

1. Bust company pack via User (`refresh=1`) and/or existing advisor refresh path so pack TTL stays coherent for Companies.
2. Refetch / invalidate `queryKeys.user(userId)`.
3. Invalidate thin growth context.
4. Do not keep a skills-bootstrap query key.

Memory-only TanStack cache; server pack TTL ~10m; `refresh=1` busts pack (same User-tier rules as data-tier design).

## Errors / soft-fail

| Case | Behavior |
| --- | --- |
| Job lookup fail | `job.status = lookupFailed`; work income 0 |
| Unemployed | `job.status = unemployed`; work income 0 |
| Missing prices / PPP | Company profit / goldPerAe → 0; income still returned |
| Lite or pack hard failure | Fail User request clearly — do not invent skills |
| Growth while User loading | Gate planner until User + growth context ready |

## Testing

- Unit: User mapper + computed income (reuse Skills income fixtures).
- Unit: Growth plan with non-zero work/self-work changes time-to-goal vs AE-only.
- API: `/api/user` contract (shape, `refresh` flag).
- Client: `queryKeys.user`, `loadPlayerData` invalidates user; Skills/Growth consume user key.

## Out of scope

- Migrating Companies/advisor onto User.
- Workers / Management income.
- Persisting Extra gold or new residual income sources on the server.
- Eco/Sustain presets or Growth AE slot capping.
- Putting Global prices on the User payload.

## Migration steps (implementation order)

1. Add User builder + `GET /api/user` (raw + computed income).
2. Wire `useUserQuery` + shell `loadPlayerData`.
3. Point Skills at User; remove skills bootstrap endpoint/cache.
4. Thin Growth bootstrap; fold work/self-work into planner daily gold; keep Extra gold UI.
5. Note in Growth / Skills / data-tier docs that User is the shared User-tier SoT for this data.

## Relationship to prior specs

| Spec | Change |
| --- | --- |
| Skills Optimizer | Bootstrap API superseded by User; income formulas unchanged |
| Factory Growth Planner | Side income no longer Extra-only; work/self-work from User; AE sum unchanged |
| Data Tier Caching | User resources expand beyond company pack + identity to include skills, job, income |
