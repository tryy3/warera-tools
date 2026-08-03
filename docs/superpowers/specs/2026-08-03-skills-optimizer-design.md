# Skills Optimizer — Design

**Date:** 2026-08-03  
**Status:** Approved for implementation  
**Depends on:** [Company Economy Advisor](./2026-07-31-company-economy-advisor-design.md) (company packs, Profit/PP, AE daily value), [Data Tier Caching](./2026-08-02-data-tier-caching-strategy-design.md) (shell player / companies query)  
**Inspired by:** [warera-eco-flame](https://warera-eco-flame.vercel.app/) Economy tab; [war-era.vercel.app/economy](https://war-era.vercel.app/economy); [Player Stats wiki](https://warera.wiki/en/player-stats)

## Goal

Answer: **with my current level and situation, where should I place skill points?**

v1 optimizes for **eco daily income** (working + self-work + AE). The page and module are named **Skills** so later objectives (e.g. Sustain / combat) can plug in without a rename.

This tool does **not** replace Companies (what to produce / switch) or Growth (buy/upgrade sequencing).

## Decisions

| Topic | Choice |
| --- | --- |
| Nav / route | **Skills** → `/skills` |
| Code layout | Pure math `src/skills/*`; UI `src/web/features/skills/*` |
| Computation | Client-side pure module; page boots from shared [User](./2026-08-03-user-data-income-design.md) (`GET /api/user`) |
| v1 objective | Economy daily gold (`totalG/day`) |
| Income sources | Work + self-work + AE; **not** workers/Management |
| Full eco reset | Treat as character reset into eco: all `totalSkillPoints` available; non-eco skills at 0 |
| Unspent optimize | Keep current levels; only allocate `availableSkillPoints` |
| Companies Limit | Current situation only: empty slots worth 0; `activeSlots = min(companiesValue, ownedCount)` |
| Self-work company | Auto-pick owned company with best self-work G/day; dropdown override |
| Job wage | Resolve via API when possible; always editable in UI |
| Skill editing | By **level** (+/−); cost to buy level \(n\) = \(n\) SP; show derived value/cap |
| Layout | Skills rail left + stacked results right (income hero → cards → situation) |
| Management | Excluded from both optimizers (may show read-only) |
| Sustain / combat modes | Out of scope for v1 (structure leaves a hook) |

## Architecture

```
[Shell player] --> GET /api/skills/bootstrap?userId=&refresh=
                         |
         +---------------+------------------+
         |               |                  |
  user.getUserLite   company pack      job wage resolve
  (skills, SP)       (reuse advisor)   getUserById.company
         |               |             -> worker.getWorkers
         |               |             -> country/region tax
         v               v                  v
              SkillsBootstrap payload
                         |
                         v
              [src/skills/* pure]  (browser)
              income · SP costs · optimize
                         |
                         v
              /skills UI (levels, breakdowns, optimize)
```

- Reuse company-pack caching and Profit/PP helpers; do not ship full switch/payback advisor rows.
- Optional `refresh=1` matches Companies / Growth semantics.
- Pure module stays unit-testable without the network.

## Routes & navigation

| Label | Path | Purpose |
| --- | --- | --- |
| Skills | `/skills` | Skill optimizer (Economy objective in v1) |

Place in shell nav beside Companies / Growth.

## Bootstrap API

`GET /api/skills/bootstrap?userId=&refresh=`

Returns **only** fields the client needs.

| Field | Notes |
| --- | --- |
| `skills` | Per-skill `level`, `value` (and any bar/regen fields useful for display); at least Energy, Entrepreneurship, Production, Companies; include others for read-only / future modes |
| `leveling` | `availableSkillPoints`, `spentSkillPoints`, `totalSkillPoints`, `level` |
| `companies[]` | `id`, `name`, `aeLevel`, `itemCode`, `productionBonus`, `profitPerPp` (or equivalent AE daily inputs) |
| `job` | Always present: `{ status, companyId?, grossWage?, incomeTaxRate?, netWage? }` — `status`: `resolved` \| `unemployed` \| `lookupFailed` |
| `recordedAt` / fetch timestamps | Freshness metadata |

### Job wage resolve (server)

1. `user.getUserById` → employer company id from `company` (or equivalent).
2. If missing → `unemployed`; work income 0 unless UI override.
3. `worker.getWorkers` for that company → row for `userId` → gross wage/PP.
4. Fallback if needed: `workOffer.getWorkOfferByCompanyId`.
5. Income tax from company location / country (live data; do not hardcode).
6. `netWage = grossWage × (1 − incomeTaxRate)`.
7. Soft-fail on lookup errors: return `lookupFailed` + null wages; UI keeps an editable field.

All listed procedures are on the public allowlist ([warera-api skill](../../../.agents/skills/warera-api/SKILL.md)).

## Skill model

### SP costs

- Cost to buy level \(n\) (from \(n-1\)): **\(n\) SP**
- Total SP to reach level \(L\) from 0: **\(L(L+1)/2\)**
- UI +/− adjusts **levels**; spent/available pool follows this curve
- Confirmed against `user.getUserLite` sample (e.g. levels 2+2+3+2 → 15 spent)

### Value from level (income inputs)

| Skill | Level 0 base | Per level |
| --- | --- | --- |
| Energy | 30 | +10 |
| Entrepreneurship | 30 | +5 |
| Production | 10 | +3 |
| Companies | 2 | +1 |

Verify against live `user.getUserLite` during implementation; adjust constants if a skill differs. Prefer deriving increments from loaded value/level when safe.

## Income math (Economy objective)

Stats regenerate **10% of max per hour** ([Player Stats](https://warera.wiki/en/player-stats)). Work / self-work consume **10** of the relevant bar per action.

```
workActions/day     = energyValue / 10 * 2.4
selfWorkActions/day = entrepreneurshipValue / 10 * 2.4
ppPerAction         = productionValue

workG/day     = workActions × ppPerAction × netWage
selfWorkG/day = selfWorkActions × ppPerAction × (1 + company.bonus) × company.profitPerPp
                // default company = max self-work G/day among owned

activeSlots   = min(companiesValue, ownedCount)
aeG/day       = sum of top `activeSlots` companies by AE daily value
                // AE daily ≈ aeLevel × (1+bonus) × 24 × profitPerPp  (existing advisor math)

totalG/day    = workG/day + selfWorkG/day + aeG/day
```

Unemployed / no wage → `workG/day = 0` (override still allowed for what-if).

## Optimizers (Economy mode)

### Spend unspent

- Start from current skill levels.
- Allocate only `availableSkillPoints` across Energy, Entrepreneurship, Production, Companies.
- Maximize `totalG/day`.
- Must not lower existing levels.
- Never spend into Management or combat skills.

### Full eco reset

- Pool = `totalSkillPoints` (character reset into eco).
- Non-eco skills treated as level 0 for the plan.
- Allocate across the four eco skills to maximize `totalG/day`.
- Prefer Companies high enough that `companiesValue ≥ ownedCount` when that does not reduce income vs alternatives.
- Never allocate Management.

### Search

Client-side. Prefer greedy marginal \(\Delta G / \Delta SP\) with recompute; use exhaustive/DP if needed for correctness. SP pools are small enough for either.

### Outputs

Suggested levels, \(\Delta\) vs current/loaded `totalG/day`, and which income bucket moved. Applying an optimize result updates the draft levels in the UI (does not call the game).

## UI

**Layout C — skills rail + stacked results**

- **Left:** editable eco skills (level, value, cost to next, −/+); SP summary; Reset / Optimize unspent / Full eco reset; other skills collapsed or read-only.
- **Right:**
  1. Hero `totalG/day` (live); \(\Delta\) vs loaded when drafting
  2. Income cards: Work, Self-work, AE — amount + short formula (flame-style)
  3. Situation: editable net wage; self-work company select; compact AE company list under Companies Limit

**Shell:** Shared player Load/refresh; no second player picker.

**Empty / errors:** no player → prompt to load; unemployed → Work 0 + note; wage lookup failed → editable wage + warning; hard-fail only if skills or companies cannot load; SP edits clamped to affordable range.

## Testing

| Layer | Coverage |
| --- | --- |
| `src/skills/*` | SP costs; value-from-level; income buckets; Companies Limit &lt; owned; unemployed work=0; unspent vs full-reset constraints; Management never chosen |
| Bootstrap route | Happy path; unemployed; wage lookup failure still returns skills/companies; `refresh=1` |
| UI smoke | Load → totals; +/− updates G/day; both optimize buttons; Reset restores loaded |

## Out of scope (later)

- Workers / Management profitability modeling
- Sustain / combat skill objectives
- Assuming empty company slots or buy/upgrade plans (Growth)
- Retask/relocate recommendations (Companies)
- Mode switcher UI (hook only in v1)

## Related docs

- [warera-game-mechanics / companies](../../../.agents/skills/warera-game-mechanics/companies.md) — AE vs employee math, production bonus
- [warera-api](../../../.agents/skills/warera-api/SKILL.md) — allowlisted procedures
- Community user shape: [user.getUserLite](https://majimawrks.github.io/warera-api-docs/specs/user.getUserLite/spec.md)
