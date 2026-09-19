# MU Fight Desk (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Fight Desk tab on `/mu/$muId` that estimates selectable-roster Now damage and Full pill-potential (Sanna math), with Spywera-style pill/build/reset row cues, warm ~5m member fight inputs, and localStorage-persisted knobs/selection.

**Architecture:** Pure `src/build-class/` + `src/fight-damage/` on the client; Geo-adjacent sibling `user_fight_snapshots` (+ poll) keep HP/pill/combat inputs warm; `GET /api/mu/:muId/fight-desk` returns inputs + `asOf` only; UI computes totals from selection. Prefer append-on-change writes (same spirit as profile/donation snapshots).

**Tech Stack:** TypeScript, Hono, Drizzle/libSQL, Vitest via `vp test`, Vite+ (`vp check` / `vp test`), TanStack Router + Query, existing MU watchlist + `mu-member-poll` patterns.

**Design:** [2026-09-15-mu-fight-desk-design.md](../specs/2026-09-15-mu-fight-desk-design.md)

## Global Constraints

- Tab on existing MU detail only — Overview (current page body) | Members (roster/history) | **Fight Desk**
- Client owns Now / Full pill-potential totals; API never returns pre-baked MU damage sums as source of truth
- Default selection = active pill only; presets replace selection; manual toggles + knobs persist in `localStorage` per `muId`
- Full pill-potential: +60% ATK for pillable non-pilled; active pill unchanged; **debuff not pillable**
- Auto-refresh replaces member inputs only (~1–5 min); never overwrite food / battleBonus / ticks / selection
- Incomplete fight fields → exclude from totals + badge (no invented zeros)
- Discord / sustain-mixed builds / auth-synced presets = out of v1
- Prefer `vp test path` / `vp check`; commit after each task
- Update `docs/warera-api/inventory.md` when fight-state poll + fight-desk API land
- **Gate:** Task 4 must freeze real WarEra field mapping before Tasks 5–7 ship parsers/schema — do not invent undocumentable fields

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/build-class/classify.ts` | eco \| war \| unknown from skill levels + SP |
| `src/build-class/skills-reset.ts` | Available vs countdown from `lastSkillsResetAt` |
| `src/build-class/index.ts` | Public exports |
| `src/build-class/*.test.ts` | Unit tests |
| `src/fight-damage/types.ts` | Player fight inputs, knobs, pill status |
| `src/fight-damage/dmg-hit.ts` | dmg/hit + hpLossPerHit |
| `src/fight-damage/project.ts` | ticks projection (HP/hunger cap at max) |
| `src/fight-damage/player-damage.ts` | Now + if-pill damage for one player |
| `src/fight-damage/aggregate.ts` | Selection totals + pill counts |
| `src/fight-damage/food.ts` | Food id → bonus fraction catalog |
| `src/fight-damage/index.ts` | Public exports |
| `src/fight-damage/*.test.ts` | Unit tests |
| `src/warera/fight-state.ts` | Parse WarEra payload → `FightStateRow` |
| `src/warera/fight-state.test.ts` | Fixtures from Task 4 |
| `src/db/schema.ts` | `user_fight_polls` + `user_fight_snapshots` |
| `drizzle/0015_*.sql` | Migration |
| `src/db/user-fight-state.ts` | Insert/latest/list-by-mu helpers + fingerprint |
| `src/db/user-fight-state.test.ts` | DB tests |
| `src/jobs/mu-fight-poll/*` | Croner job ~5m over watched MU members |
| `src/jobs/registry.ts` | Register job |
| `src/server/routes/mu-fight-desk.ts` | `GET` + force refresh |
| `src/server/routes/mu-fight-desk.test.ts` | Route tests |
| `src/server/app.ts` | Mount under `/api/mu` |
| `src/web/lib/fightDeskPrefs.ts` | localStorage load/save + schema version |
| `src/web/lib/fightDeskPrefs.test.ts` | Prefs tests |
| `src/web/lib/fightDeskSelection.ts` | Presets → selected id sets |
| `src/web/lib/fightDeskSelection.test.ts` | Preset tests |
| `src/web/query/keys.ts` | `muFightDesk` key |
| `src/web/query/useMuFightDeskQuery.ts` | TQ hook + refetch interval |
| `src/web/features/mu/MuDetailPage.tsx` | Tab chrome |
| `src/web/features/mu/FightDeskTab.tsx` | Controls + summary + list |
| `src/web/features/mu/FightDeskMemberRow.tsx` | Row + expand |
| `src/web/features/mu/types.ts` | Fight-desk response types |
| `docs/warera-api/inventory.md` | New Geo row + consumer |

---

### Task 1: `build-class` — eco vs war

**Files:**
- Create: `src/build-class/classify.ts`
- Create: `src/build-class/classify.test.ts`
- Create: `src/build-class/index.ts`

**Interfaces:**
- Consumes: `ECO_SKILL_IDS` from `src/skills/values.ts`; `FIGHT_SKILL_IDS` + aliases via `fightLevelsFromUserSkills` / `FIGHT_SKILL_IDS` from `src/battle-build/fight-skills.ts`; `totalSpToReachLevel` from `src/skills/sp.ts`
- Produces:
  - `export type BuildClass = "eco" | "war" | "unknown"`
  - `export function classifyBuildFromSkillLevels(skills: Record<string, { level: number }>): BuildClass`
  - Rule: sum triangular SP for eco ids vs fight ids (alias-aware); `eco > war` → eco; `war > eco` → war; tie → war; both 0 → unknown

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vite-plus/test";
import { classifyBuildFromSkillLevels } from "./classify";

describe("classifyBuildFromSkillLevels", () => {
  it("classifies eco when eco SP dominates", () => {
    expect(
      classifyBuildFromSkillLevels({
        energy: { level: 5 },
        production: { level: 3 },
        attack: { level: 1 },
      }),
    ).toBe("eco");
  });

  it("classifies war when fight SP dominates", () => {
    expect(
      classifyBuildFromSkillLevels({
        energy: { level: 1 },
        attack: { level: 10 },
        precision: { level: 5 },
      }),
    ).toBe("war");
  });

  it("ties go to war", () => {
    // craft equal SP on both sides for the assertion
    expect(
      classifyBuildFromSkillLevels({
        energy: { level: 2 }, // SP = 3
        attack: { level: 2 }, // SP = 3
      }),
    ).toBe("war");
  });

  it("returns unknown when no usable levels", () => {
    expect(classifyBuildFromSkillLevels({})).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/build-class/classify.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement**

```ts
import { FIGHT_SKILL_IDS, fightLevelsFromUserSkills } from "../battle-build/fight-skills";
import { totalSpToReachLevel } from "../skills/sp";
import { ECO_SKILL_IDS } from "../skills/values";

export type BuildClass = "eco" | "war" | "unknown";

export function classifyBuildFromSkillLevels(
  skills: Record<string, { level: number }>,
): BuildClass {
  let ecoSp = 0;
  for (const id of ECO_SKILL_IDS) {
    const level = skills[id]?.level;
    if (typeof level === "number" && Number.isFinite(level)) {
      ecoSp += totalSpToReachLevel(Math.max(0, Math.floor(level)));
    }
  }

  const fight = fightLevelsFromUserSkills(skills);
  let warSp = 0;
  for (const id of FIGHT_SKILL_IDS) {
    warSp += totalSpToReachLevel(fight[id]);
  }

  if (ecoSp === 0 && warSp === 0) return "unknown";
  if (ecoSp > warSp) return "eco";
  return "war";
}
```

Export from `index.ts`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `vp test src/build-class/classify.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/build-class
git commit -m "feat: add eco/war build classifier from skill SP"
```

---

### Task 2: `build-class` — skills reset timer

**Files:**
- Create: `src/build-class/skills-reset.ts`
- Create: `src/build-class/skills-reset.test.ts`
- Modify: `src/build-class/index.ts`

**Interfaces:**
- Produces:
  - `export const SKILLS_RESET_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000` // confirm vs Spywera/live before ship; keep named
  - `export type SkillsResetStatus = { kind: "available" } | { kind: "cooldown"; endsAt: Date; remainingMs: number }`
  - `export function skillsResetStatus(lastSkillsResetAt: Date | null, now?: Date): SkillsResetStatus`

- [ ] **Step 1: Write failing tests** for available when null / when cooldown elapsed; cooldown when inside window (remainingMs ≈ endsAt - now).

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement** — if `lastSkillsResetAt == null` → available; else `endsAt = last + COOLDOWN`; if `now >= endsAt` → available else cooldown.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/build-class
git commit -m "feat: add skills-reset available/cooldown helper"
```

---

### Task 3: `fight-damage` pure math

**Files:**
- Create: `src/fight-damage/types.ts`
- Create: `src/fight-damage/food.ts`
- Create: `src/fight-damage/dmg-hit.ts`
- Create: `src/fight-damage/project.ts`
- Create: `src/fight-damage/player-damage.ts`
- Create: `src/fight-damage/aggregate.ts`
- Create: `src/fight-damage/index.ts`
- Create: matching `*.test.ts` files (can co-locate per file)

**Interfaces:**
- Produces (freeze these names for later tasks):

```ts
export type PillStatus = "active" | "debuff" | "ready";

export type FightPlayerInput = {
  userId: string;
  atk: number; // already includes mil rank, current pill/debuff, ammo
  precision: number; // 0..1
  critChance: number; // 0..1
  critDamage: number; // bonus portion for (1 + critDamage); UI 266% → 2.66
  armor: number;
  dodge: number;
  hp: number;
  maxHp: number;
  hunger: number;
  maxHunger: number;
  hpRegenPerHour: number;
  hungerRegenPerHour: number;
  pillStatus: PillStatus;
  // optional display fields ignored by math
};

export type FightKnobs = {
  foodId: string;
  foodBonus: number; // e.g. 0.15 for +15%
  battleBonus: number; // e.g. 0.1 for +10% on final damage
  ticks: number; // hours
};

export const PILL_ATK_BONUS = 0.6;
export const HP_LOSS_DIMINISH_K = 40;
export const BASE_HP_LOSS_PER_HIT = 1;

export function foodBonusForId(foodId: string): number;
export function dmgPerHit(input: Pick<FightPlayerInput, "atk" | "precision" | "critChance" | "critDamage">): number;
export function hpLossPerHit(armor: number, dodge: number): number;
export function projectResources(input: FightPlayerInput, ticks: number): { hp: number; hunger: number };
export function playerDamageNow(input: FightPlayerInput, knobs: FightKnobs): number;
export function playerDamageIfPill(input: FightPlayerInput, knobs: FightKnobs): number; // uplift ATK only when pillStatus === "ready"
export function aggregateFightDesk(
  players: FightPlayerInput[],
  selectedIds: ReadonlySet<string>,
  knobs: FightKnobs,
): {
  now: number;
  fullPillPotential: number;
  selectedCount: number;
  avgPerMember: number;
  topDamage: number;
  pillCounts: { active: number; debuff: number; ready: number };
};
```

**Formula pins (from design / Sanna):**

```
dmg/hit = precision * (critChance * ATK * (1 + critDamage) + (1 - critChance) * ATK)
        + (1 - precision) * ATK * 0.5

hpLossPerHit = BASE_HP_LOSS_PER_HIT * (HP_LOSS_DIMINISH_K / (armor + dodge + HP_LOSS_DIMINISH_K))

effectiveHpPool = hp + hunger * foodBonus * maxHp
maxHits = effectiveHpPool / hpLossPerHit
damage = dmg/hit * maxHits * (1 + battleBonus)
```

`critDamage` in code is the **bonus multiplier portion** as used in `(1 + critDmg%)` — if UI shows 266%, pass `2.66`. Document in `types.ts` JSDoc.

`playerDamageIfPill`: clone input with `atk * (1 + PILL_ATK_BONUS)` only when `pillStatus === "ready"`; active/debuff unchanged (debuff must not uplift).

`aggregateFightDesk.fullPillPotential`: sum `playerDamageIfPill` for selected; `.now` sums `playerDamageNow`. `pillCounts` over **all** roster players (not only selected). `topDamage` = max Now among selected. `avgPerMember` = now / selectedCount or 0.

Food catalog v1 (ids stable):

```ts
export const FIGHT_FOOD_OPTIONS = [
  { id: "none", label: "None", bonus: 0 },
  { id: "steak", label: "Steak (+15%)", bonus: 0.15 },
] as const;
```

Extend later if more foods confirmed.

- [ ] **Step 1: Write failing tests** covering:
  - dmg/hit known numeric fixture
  - hpLoss diminishing returns (armor+dodge=0 → 1; higher total → lower loss)
  - ticks project and cap at max
  - ready player: ifPill > now; active: ifPill === now; debuff: ifPill === now
  - aggregate selection + pill counts

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement modules**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/fight-damage
git commit -m "feat: add pure MU fight-damage math (Sanna rules)"
```

---

### Task 4: WarEra fight-state field discovery (GATE)

**Files:**
- Create: `docs/superpowers/plans/notes/2026-09-15-fight-state-field-map.md` (working notes; keep short)
- Create: `src/warera/fight-state.fixture.json` (sanitized real or representative payload subset)
- Create: `src/warera/fight-state.ts` (parser stub typed to discovered fields)
- Create: `src/warera/fight-state.test.ts`

**Interfaces:**
- Produces:
  - `export type ParsedFightState = { ... }` mapping onto `FightPlayerInput` fields + display (`username`, `level`, `militaryRankBonus`, `ammoLabel`, `pillLabel`, `pillEndsAt`, `skillLevels`, `lastSkillsResetAt`, `avatarUrl`)
  - `export function parseFightState(raw: unknown): ParsedFightState | null`
  - `export function toFightPlayerInput(parsed: ParsedFightState): FightPlayerInput`

**Steps:**

- [ ] **Step 1: Inventory allowlisted procedures** in `.agents/skills/warera-api/` — start with `user.getUserById` / `user.getUserLite`; note if combat stats need another allowlisted call. Do **not** add undocumented endpoints without user confirmation.

- [ ] **Step 2: Capture or reconstruct a fixture** — from a logged response, Sanna-visible fields, or a minimal hand-built JSON that matches live keys once verified. Record key paths in the notes file (e.g. `stats.health.current`, `buffs.pill`, … — use **actual** keys found).

- [ ] **Step 3: Write failing parser tests** against the fixture asserting ATK, HP, hunger, pillStatus, skills present.

- [ ] **Step 4: Implement `parseFightState` / `toFightPlayerInput`**

- [ ] **Step 5: Run `vp test src/warera/fight-state.test.ts` — PASS**

- [ ] **Step 6: Commit**

```bash
git add src/warera/fight-state.ts src/warera/fight-state.test.ts src/warera/fight-state.fixture.json docs/superpowers/plans/notes/2026-09-15-fight-state-field-map.md
git commit -m "feat: parse WarEra user fight-state fields for Fight Desk"
```

**If discovery fails** (fields not on allowlisted APIs): stop and report to the user with what was found — do not invent scrapers.

---

### Task 5: DB schema + latest fight snapshots

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0015_user_fight_snapshots.sql` (generate via project drizzle workflow if that’s the norm; otherwise hand-write matching schema)
- Create: `src/db/user-fight-state.ts`
- Create: `src/db/user-fight-state.test.ts`

**Interfaces:**
- Tables:
  - `user_fight_polls` — id, recordedAt, status, error, userCount, muCount (mirror profile polls)
  - `user_fight_snapshots` — typed columns for every field needed to rebuild `ParsedFightState` / `FightPlayerInput` (prefer typed columns; JSON only for leftover display blobs if unavoidable). Include `userId`, `muId`, `recordedAt`, `pollId`, skill levels needed for `build-class`, `lastSkillsResetAt`, pill fields, combat numbers.
- Produces:
  - `fightStateContentFingerprint(row): string`
  - `insertUserFightPoll`, `insertUserFightSnapshots` (append-on-change vs previous fingerprint)
  - `getLatestFightState(db, userId)`
  - `listLatestFightStatesForMu(db, muId): ParsedFightState[]` (join roster `mu_members` → latest snapshot per user)

Use in-memory libSQL test pattern from `src/db/user-profiles.test.ts`.

- [ ] **Step 1: Failing DB tests** for insert + latest + fingerprint skip

- [ ] **Step 2: Schema + migration + helpers**

- [ ] **Step 3: Tests PASS**

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts src/db/user-fight-state.ts src/db/user-fight-state.test.ts drizzle/0015_*.sql
git commit -m "feat: add user_fight_snapshots storage for Fight Desk"
```

---

### Task 6: `mu-fight-poll` job

**Files:**
- Create: `src/jobs/mu-fight-poll/index.ts`
- Create: `src/jobs/mu-fight-poll/run.ts`
- Create: `src/jobs/mu-fight-poll/run.test.ts`
- Modify: `src/jobs/registry.ts`

**Interfaces:**
- Job id: `mu-fight-poll`
- Default cron: `0 */5 * * * *` (same cadence family as `mu-member-poll`)
- Default enabled: `true`
- Run: watched MU member user ids → batch fetch (same procedure(s) as Task 4) → parse → fingerprint insert
- Reuse `listDistinctWatchedMuMemberUserIds` from `src/db/user-profiles.ts` (or shared helper)
- Reuse `createFingerprintCache` pattern from `mu-member-poll`

- [ ] **Step 1: Failing run test** with mocked warera batch

- [ ] **Step 2: Implement run + register**

- [ ] **Step 3: PASS**

- [ ] **Step 4: Commit**

```bash
git add src/jobs/mu-fight-poll src/jobs/registry.ts
git commit -m "feat: add mu-fight-poll for warm Fight Desk inputs"
```

---

### Task 7: Fight Desk API

**Files:**
- Create: `src/server/routes/mu-fight-desk.ts`
- Create: `src/server/routes/mu-fight-desk.test.ts`
- Modify: `src/server/app.ts` (mount)

**Interfaces:**
- `GET /api/mu/:muId/fight-desk` →

```ts
{
  mu: { id: string; name: string | null };
  asOf: string | null; // ISO of newest snapshot among members
  members: Array<{
    userId: string;
    username: string | null;
    level: number | null;
    role: string | null;
    incomplete: boolean;
    fight: FightPlayerInput | null; // null if incomplete
    display: {
      avatarUrl: string | null;
      militaryRank: number | null;
      ammoLabel: string | null;
      pillLabel: string | null;
      pillEndsAt: string | null;
      skillLevels: Record<string, number>;
      lastSkillsResetAt: string | null;
    };
  }>;
  meta: { watched: boolean; liveFilled: boolean };
}
```

- `POST /api/mu/:muId/fight-desk/refresh` (or `GET ?refresh=1`): force live fetch for roster members, write snapshots when parse ok, return same shape. Does not clear client prefs.

Cold miss: if no snapshots and MU watched (or always for refresh), live-fill via WarEra; do not require inventing zeros.

- [ ] **Step 1: Route tests** — empty roster; incomplete member flagged; happy path with seeded DB

- [ ] **Step 2: Implement + mount**

- [ ] **Step 3: PASS**

- [ ] **Step 4: Update `docs/warera-api/inventory.md`** — Geo row for fight-state + Fight Desk consumer

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/mu-fight-desk.ts src/server/routes/mu-fight-desk.test.ts src/server/app.ts docs/warera-api/inventory.md
git commit -m "feat: add GET/refresh MU fight-desk API"
```

---

### Task 8: localStorage prefs + selection presets

**Files:**
- Create: `src/web/lib/fightDeskPrefs.ts`
- Create: `src/web/lib/fightDeskPrefs.test.ts`
- Create: `src/web/lib/fightDeskSelection.ts`
- Create: `src/web/lib/fightDeskSelection.test.ts`

**Interfaces:**

```ts
export const FIGHT_DESK_PREFS_VERSION = 1;
export type FightDeskPrefsV1 = {
  v: 1;
  foodId: string;
  battleBonus: number;
  ticks: number;
  selectedUserIds: string[];
  lastPresetId: string | null;
  expandedUserIds: string[];
};

export function fightDeskPrefsKey(muId: string): string; // `fightDeskPrefs:v1:${muId}`
export function loadFightDeskPrefs(muId: string): FightDeskPrefsV1 | null;
export function saveFightDeskPrefs(muId: string, prefs: FightDeskPrefsV1): void;
export function defaultFightDeskPrefs(): FightDeskPrefsV1; // steak or none, bonus 0, ticks 0, empty selection

export type FightDeskPresetId =
  | "pilled"
  | "ready"
  | "pilled_ready"
  | "damage_build"
  | "all"
  | "none";

export function applyFightDeskPreset(
  preset: FightDeskPresetId,
  members: Array<{ userId: string; pillStatus: PillStatus; buildClass: BuildClass }>,
): string[];
```

Default first visit (no prefs): UI will select active pill via preset `pilled` after load — prefs may store that set on first interaction or initialize selection from `pilled` when `selectedUserIds` empty.

New members: when prefs exist, ids not in `selectedUserIds` stay unchecked until preset applied.

- [ ] **Step 1–4: TDD prefs + presets**

- [ ] **Step 5: Commit**

```bash
git add src/web/lib/fightDeskPrefs.ts src/web/lib/fightDeskPrefs.test.ts src/web/lib/fightDeskSelection.ts src/web/lib/fightDeskSelection.test.ts
git commit -m "feat: persist Fight Desk knobs and selection presets"
```

---

### Task 9: MU detail tabs + Fight Desk shell UI

**Files:**
- Modify: `src/web/features/mu/MuDetailPage.tsx`
- Modify: `src/web/routes/mu_.$muId.tsx` (search param `tab` if needed)
- Create: `src/web/features/mu/FightDeskTab.tsx`
- Create: `src/web/query/useMuFightDeskQuery.ts`
- Modify: `src/web/query/keys.ts`
- Modify: `src/web/features/mu/types.ts`

**Behavior:**
- Tabs: `overview` | `members` | `fight` (Fight Desk). Overview = existing Current + MU history; Members = member history + roster table; Fight = new tab.
- Fight tab: header pill counts, age, ↻ calling refresh endpoint; food select; Advanced (battle bonus %, ticks); preset buttons; summary cards (Now, Full pill-potential, Members, Avg, Top); list placeholder OK if rows land in Task 10.
- Use `useMuFightDeskQuery` with `refetchInterval` 60_000–300_000; merge server members with prefs without resetting knobs.
- On first load with empty selection: apply `pilled` preset once.

- [ ] **Step 1: Implement tab chrome + FightDeskTab wiring to API/prefs/math aggregate**

- [ ] **Step 2: Manual smoke / light component test if pattern exists; else `vp check` on touched files**

- [ ] **Step 3: Commit**

```bash
git add src/web/features/mu src/web/routes/mu_.$muId.tsx src/web/query
git commit -m "feat: add Fight Desk tab shell on MU detail"
```

---

### Task 10: Member rows + expand breakdown

**Files:**
- Create: `src/web/features/mu/FightDeskMemberRow.tsx`
- Modify: `src/web/features/mu/FightDeskTab.tsx`

**Row (collapsed):** checkbox, rank index, level + purple/red pill dot, name, eco/war icon (`classifyBuildFromSkillLevels`), pill Ready/timer, skills-reset Available/countdown, HP + hunger bars, Now damage, secondary if-pill when `pillStatus !== "active"`, expand chevron.

**Expanded:** ATK, mil rank, precision, crit, crit dmg, armor, dodge, hunger, ammo, dmg/hit, pill label+timer — values from API display + `dmgPerHit` / projected resources.

Incomplete: badge; checkbox disabled or excluded from totals.

- [ ] **Step 1: Implement row + wire into list sort (Total Now desc default; optional Potential / HP / Name)**

- [ ] **Step 2: `vp check` + targeted tests if any**

- [ ] **Step 3: Commit**

```bash
git add src/web/features/mu/FightDeskMemberRow.tsx src/web/features/mu/FightDeskTab.tsx
git commit -m "feat: Fight Desk member rows with pill/build cues and expand"
```

---

### Task 11: Verification + inventory polish

- [ ] **Step 1: Run** `vp test src/build-class src/fight-damage src/warera/fight-state.test.ts src/db/user-fight-state.test.ts src/jobs/mu-fight-poll src/server/routes/mu-fight-desk.test.ts src/web/lib/fightDeskPrefs.test.ts src/web/lib/fightDeskSelection.test.ts`

- [ ] **Step 2: Run** `vp check`

- [ ] **Step 3: Confirm inventory.md lists fight-state job + Fight Desk; procedures.md `used-here` if a new procedure was marked

- [ ] **Step 4: Commit any doc/fixups**

```bash
git add docs/warera-api/inventory.md .agents/skills/warera-api/procedures.md
git commit -m "docs: note Fight Desk fight-state inventory"
```

---

## Spec coverage (self-check)

| Spec requirement | Task |
| --- | --- |
| Fight Desk tab on MU detail | 9 |
| Now + Full pill-potential, food, bonus, ticks | 3, 8, 9 |
| Default pilled; presets; persist selection | 8, 9 |
| Debuff not pillable in potential | 3 |
| Eco/war + skill-reset + pill timers on row | 1, 2, 10 |
| Expand transparency | 3, 10 |
| Auto-refresh status; knobs sticky | 8, 9 |
| Warm ~5m Geo snapshots | 5, 6 |
| API inputs not pre-baked totals | 7 |
| Incomplete exclude + badge | 7, 10 |
| Global build-class | 1 |
| Discord later | out of scope |
| inventory.md update | 7, 11 |
