# Skill Rail WarEra Visual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Skills rail to match WarEra’s level-box UI (gradients, affordability opacity, circular steppers) and re-hierarchy actions (Reset / Full Optimize + Optimize unspent / Restore).

**Architecture:** Pure domain helpers for max level + SP affordability live in `src/skills/sp.ts` and are reused by the optimizer clamp and the UI meter. Visual tokens extend `skillVisuals.ts`. `SkillLevelMeter` renders the 10-box row; `SkillRail` composes wells, meters, Management read-only, and the new action chrome. `SkillsPage` splits zero-out **Reset** from snapshot **Restore**.

**Tech Stack:** React 19, Tailwind, Lucide (`Sparkles`, `Coins`), existing shadcn `Button`, Vitest via `vp test`.

**Design:** [2026-08-03-skill-rail-warera-visual-design.md](../specs/2026-08-03-skill-rail-warera-visual-design.md)

## Global Constraints

- Max eco skill level: **10** (clamp UI + `optimizeEcoSkills`)
- Empty box fill: `#252E34`; affordable opacity `1`, unreachable `0.2`
- Filled box / well / `+` button: skill `boxBackground` gradients from the spec
- Icon fills: existing `SKILL_VISUALS[].color` values
- Actions: header **Reset** (zero eco levels only); footer **Full Optimize** (left, Sparkles) + **Optimize unspent** (right, Coins); **Restore** text link below
- Management: main list, read-only; excluded from “Other skills”
- No click-to-jump on empty boxes (steppers only)
- Prefer `vp test path/to/file.test.ts` while iterating; `vp check` before claiming done
- Commit after each task

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/skills/sp.ts` | `MAX_ECO_SKILL_LEVEL`, `maxAffordableLevel` |
| `src/skills/sp.test.ts` | Tests for affordability + max |
| `src/skills/optimize.ts` | Skip levels above max |
| `src/skills/optimize.test.ts` | Assert optimizer never exceeds Lv 10 |
| `src/skills/index.ts` | Re-export new helpers if other modules need them |
| `src/web/features/skills/skillVisuals.ts` | Add `boxBackground`; `EMPTY_SKILL_BOX_BG` |
| `src/web/features/skills/SkillLevelMeter.tsx` | 10-box meter + circular ± |
| `src/web/features/skills/SkillRail.tsx` | WarEra rows, Management, action layout |
| `src/web/features/skills/SkillsPage.tsx` | `handleReset` vs `handleRestore`; prop wiring |

---

### Task 1: Max level + affordability helpers + optimizer clamp

**Files:**
- Modify: `src/skills/sp.ts`
- Modify: `src/skills/sp.test.ts`
- Modify: `src/skills/optimize.ts`
- Modify: `src/skills/optimize.test.ts`
- Modify: `src/skills/index.ts` (re-export)

**Interfaces:**
- Produces:
  - `export const MAX_ECO_SKILL_LEVEL = 10`
  - `export function maxAffordableLevel(currentLevel: number, freeSp: number, maxLevel?: number): number`
  - Optimizer never returns a level `> MAX_ECO_SKILL_LEVEL`

- [ ] **Step 1: Write failing affordability tests**

Append to `src/skills/sp.test.ts`:

```ts
import {
  MAX_ECO_SKILL_LEVEL,
  maxAffordableLevel,
  spCostForLevel,
  totalSpForLevels,
  totalSpToReachLevel,
} from "./sp";

describe("maxAffordableLevel", () => {
  it("with 3 SP from 0 can reach level 2 (costs 1+2)", () => {
    expect(maxAffordableLevel(0, 3)).toBe(2);
  });

  it("with 3 SP at level 7 cannot buy level 8 (costs 8)", () => {
    expect(maxAffordableLevel(7, 3)).toBe(7);
  });

  it("with 15 SP at level 5 can reach level 7 (costs 6+7)", () => {
    expect(maxAffordableLevel(5, 15)).toBe(7);
  });

  it("never exceeds MAX_ECO_SKILL_LEVEL", () => {
    expect(maxAffordableLevel(0, 1_000_000)).toBe(MAX_ECO_SKILL_LEVEL);
  });
});
```

Keep existing `spCostForLevel` describe block; fix imports so there is a single import from `./sp`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/skills/sp.test.ts`

Expected: FAIL — `maxAffordableLevel` / `MAX_ECO_SKILL_LEVEL` not exported.

- [ ] **Step 3: Implement helpers in `sp.ts`**

```ts
export const MAX_ECO_SKILL_LEVEL = 10;

export function spCostForLevel(level: number): number {
  return level >= 1 ? level : 0;
}

export function maxAffordableLevel(
  currentLevel: number,
  freeSp: number,
  maxLevel: number = MAX_ECO_SKILL_LEVEL,
): number {
  let level = Math.max(0, Math.min(maxLevel, Math.floor(currentLevel)));
  let remaining = Math.max(0, freeSp);
  while (level < maxLevel) {
    const cost = spCostForLevel(level + 1);
    if (cost <= 0 || cost > remaining) break;
    remaining -= cost;
    level += 1;
  }
  return level;
}

// ... existing totalSpToReachLevel / totalSpForLevels unchanged
```

- [ ] **Step 4: Run `sp` tests — expect PASS**

Run: `vp test src/skills/sp.test.ts`

Expected: PASS

- [ ] **Step 5: Write failing optimizer max-level test**

Append to `src/skills/optimize.test.ts`:

```ts
it("never raises any eco skill above MAX_ECO_SKILL_LEVEL", () => {
  const r = optimizeEcoSkills({
    mode: "full_eco_reset",
    currentLevels: { energy: 0, entrepreneurship: 0, production: 0, companies: 0 },
    availableSkillPoints: 0,
    totalSkillPoints: 10_000,
    netWage: 1,
    companies: [
      { id: "a", name: "a", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
      { id: "b", name: "b", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
      { id: "c", name: "c", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
      { id: "d", name: "d", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
      { id: "e", name: "e", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
      { id: "f", name: "f", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
      { id: "g", name: "g", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
      { id: "h", name: "h", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
      { id: "i", name: "i", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
      { id: "j", name: "j", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
      { id: "k", name: "k", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
      { id: "l", name: "l", aeLevel: 20, productionBonus: 1, profitPerPp: 1 },
    ],
  });
  for (const k of ["energy", "entrepreneurship", "production", "companies"] as const) {
    expect(r.levels[k]).toBeLessThanOrEqual(10);
  }
});
```

Import `MAX_ECO_SKILL_LEVEL` only if you assert against the constant; numeric `10` is fine.

- [ ] **Step 6: Run optimizer test — expect FAIL or PASS**

Run: `vp test src/skills/optimize.test.ts`

If levels already never exceed 10 with this budget shape, the test may pass without a code change — still add the guard in Step 7 so the invariant is explicit.

- [ ] **Step 7: Clamp in `optimize.ts`**

At the top of the skill loop candidate check (inside `for (const skill of ECO_SKILL_IDS)`), after `const nextLevel = levels[skill] + 1`:

```ts
import { MAX_ECO_SKILL_LEVEL, spCostForLevel } from "./sp";

// inside loop:
const nextLevel = levels[skill] + 1;
if (nextLevel > MAX_ECO_SKILL_LEVEL) continue;
const cost = spCostForLevel(nextLevel);
```

- [ ] **Step 8: Re-export from `src/skills/index.ts`**

```ts
export {
  MAX_ECO_SKILL_LEVEL,
  maxAffordableLevel,
  spCostForLevel,
  totalSpForLevels,
  totalSpToReachLevel,
} from "./sp";
```

- [ ] **Step 9: Run both test files — expect PASS**

Run: `vp test src/skills/sp.test.ts src/skills/optimize.test.ts`

Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/skills/sp.ts src/skills/sp.test.ts src/skills/optimize.ts src/skills/optimize.test.ts src/skills/index.ts
git commit -m "$(cat <<'EOF'
feat(skills): clamp eco levels at 10 and expose affordability helper

EOF
)"
```

---

### Task 2: Visual tokens (`boxBackground` + empty box color)

**Files:**
- Modify: `src/web/features/skills/skillVisuals.ts`

**Interfaces:**
- Produces: `SkillVisual.boxBackground: string`; `export const EMPTY_SKILL_BOX_BG = "#252E34"`

- [ ] **Step 1: Extend `SkillVisual` and constants**

Update `skillVisuals.ts`:

```ts
import type { EcoSkillId } from "@/skills/values";

export type SkillVisualId = EcoSkillId | "management";

export type SkillVisual = {
  id: SkillVisualId;
  label: string;
  color: string;
  boxBackground: string;
  path: string;
};

/** Empty (unfilled) skill meter slot background — WarEra client. */
export const EMPTY_SKILL_BOX_BG = "#252E34";

export const SKILL_VISUALS: Record<SkillVisualId, SkillVisual> = {
  entrepreneurship: {
    id: "entrepreneurship",
    label: "Entrepreneurship",
    color: "#E0B8D7",
    boxBackground: "linear-gradient(45deg,#743265,#59274D)",
    path: "M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2M9,21A1,1 0 0,0 10,22H14A1,1 0 0,0 15,21V20H9V21Z",
  },
  energy: {
    id: "energy",
    label: "Energy",
    color: "#ABC0ED",
    boxBackground: "linear-gradient(45deg,#1E3F88,#173168)",
    path: "M11 15H6L13 1V9H18L11 23V15Z",
  },
  production: {
    id: "production",
    label: "Production",
    color: "#E1CEA5",
    boxBackground: "linear-gradient(45deg,#705825,#56441C)",
    path: "M14.79,10.62L3.5,21.9L2.1,20.5L13.38,9.21L14.79,10.62M19.27,7.73L19.86,7.14L19.07,6.35L19.71,5.71L18.29,4.29L17.65,4.93L16.86,4.14L16.27,4.73C14.53,3.31 12.57,2.17 10.47,1.37L9.64,3.16C11.39,4.08 13,5.19 14.5,6.5L14,7L17,10L17.5,9.5C18.81,11 19.92,12.61 20.84,14.36L22.63,13.53C21.83,11.43 20.69,9.47 19.27,7.73Z",
  },
  companies: {
    id: "companies",
    label: "Companies Limit",
    color: "#E1CEA5",
    boxBackground: "linear-gradient(45deg,#705825,#56441C)",
    path: "M4,18V20H8V18H4M4,14V16H14V14H4M10,18V20H14V18H10M16,14V16H20V14H16M16,18V20H20V18H16M2,22V8L7,12V8L12,12V8L17,12L18,2H21L22,12V22H2Z",
  },
  management: {
    id: "management",
    label: "Management",
    color: "#C8B7E1",
    boxBackground: "linear-gradient(45deg,#4C3076,#3B255A)",
    path: "M12 3C14.21 3 16 4.79 16 7S14.21 11 12 11 8 9.21 8 7 9.79 3 12 3M16 13.54C16 14.6 15.72 17.07 13.81 19.83L13 15L13.94 13.12C13.32 13.05 12.67 13 12 13S10.68 13.05 10.06 13.12L11 15L10.19 19.83C8.28 17.07 8 14.6 8 13.54C5.61 14.24 4 15.5 4 17V21H20V17C20 15.5 18.4 14.24 16 13.54Z",
  },
};

/** Display order matching the in-game Skills panel. */
export const SKILL_PANEL_ORDER: SkillVisualId[] = [
  "entrepreneurship",
  "energy",
  "production",
  "companies",
  "management",
];
```

- [ ] **Step 2: Typecheck the visuals module**

Run: `vp check`

Expected: PASS for this file (or only pre-existing unrelated failures). If `SkillVisual` consumers break, fix them in this commit only if they already referenced the type shape.

- [ ] **Step 3: Commit**

```bash
git add src/web/features/skills/skillVisuals.ts
git commit -m "$(cat <<'EOF'
feat(skills): add WarEra boxBackground tokens for skill visuals

EOF
)"
```

---

### Task 3: `SkillLevelMeter` component

**Files:**
- Create: `src/web/features/skills/SkillLevelMeter.tsx`

**Interfaces:**
- Consumes: `SkillIcon`, `SKILL_VISUALS`, `EMPTY_SKILL_BOX_BG`, `MAX_ECO_SKILL_LEVEL`, `maxAffordableLevel`, `SkillVisualId`
- Produces:

```ts
export function SkillLevelMeter(props: {
  skill: SkillVisualId;
  level: number;
  freeSp: number;
  readOnly?: boolean;
  canUp: boolean;
  canDown: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}): JSX.Element
```

- [ ] **Step 1: Implement `SkillLevelMeter.tsx`**

```tsx
import { Minus, Plus } from "lucide-react";
import { MAX_ECO_SKILL_LEVEL, maxAffordableLevel } from "@/skills/sp";
import { SkillIcon } from "./SkillIcon";
import { EMPTY_SKILL_BOX_BG, SKILL_VISUALS, type SkillVisualId } from "./skillVisuals";

type SkillLevelMeterProps = {
  skill: SkillVisualId;
  level: number;
  freeSp: number;
  readOnly?: boolean;
  canUp: boolean;
  canDown: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
};

export function SkillLevelMeter({
  skill,
  level,
  freeSp,
  readOnly = false,
  canUp,
  canDown,
  onDecrease,
  onIncrease,
}: SkillLevelMeterProps) {
  const visual = SKILL_VISUALS[skill];
  const affordableThru = maxAffordableLevel(level, freeSp);
  const slots = Array.from({ length: MAX_ECO_SKILL_LEVEL }, (_, i) => i + 1);

  return (
    <div className="flex items-center gap-2" style={{ ["--skill-icon" as string]: visual.color }}>
      <div className="flex min-w-0 flex-1 gap-[3px]">
        {slots.map((slotLevel) => {
          const filled = slotLevel <= level;
          if (filled) {
            return (
              <div
                key={slotLevel}
                className="grid aspect-[0.72] max-h-7 flex-1 place-items-center rounded-[4px]"
                style={{ background: visual.boxBackground }}
                aria-hidden
              >
                <SkillIcon skill={skill} className="size-3.5" style={{ color: visual.color } as never} />
              </div>
            );
          }
          const affordable = slotLevel <= affordableThru;
          return (
            <div
              key={slotLevel}
              className="aspect-[0.72] max-h-7 flex-1 rounded-[4px]"
              style={{
                background: EMPTY_SKILL_BOX_BG,
                opacity: affordable ? 1 : 0.2,
              }}
              aria-hidden
            />
          );
        })}
      </div>

      {readOnly ? null : (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            disabled={!canDown}
            aria-label={`Decrease ${visual.label}`}
            onClick={onDecrease}
            className="grid size-7 place-items-center rounded-full border border-white/15 bg-[#1a1f2a] text-muted-foreground transition-[border-color,background-color] hover:border-dotted hover:border-white/55 hover:bg-[#232833] disabled:opacity-40"
          >
            <Minus className="size-3.5" />
          </button>
          <button
            type="button"
            disabled={!canUp}
            aria-label={`Increase ${visual.label}`}
            onClick={onIncrease}
            className="grid size-7 place-items-center rounded-full border border-transparent text-[color:var(--skill-icon)] transition-[border-color] hover:border-dotted hover:border-[color:color-mix(in_srgb,var(--skill-icon)_75%,white)] disabled:opacity-40"
            style={{ background: visual.boxBackground }}
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
```

**Note on `SkillIcon`:** today it sets `fill="currentColor"` but no `color` class. Prefer wrapping filled boxes with `style={{ color: visual.color }}` on a parent `span`/`div` instead of passing invalid `style` into `SkillIcon` if its props don’t accept `style`. Adjust `SkillIcon` to accept optional `style?: React.CSSProperties` **or** wrap:

```tsx
<div style={{ color: visual.color }} className="grid place-items-center">
  <SkillIcon skill={skill} className="size-3.5" />
</div>
```

Use the wrap approach — do not change `SkillIcon` props unless required.

- [ ] **Step 2: Fix TypeScript if `SkillIcon` / CSS var typing complains**

Run: `vp check`

Expected: PASS (or only fix issues introduced by this file).

- [ ] **Step 3: Commit**

```bash
git add src/web/features/skills/SkillLevelMeter.tsx
git commit -m "$(cat <<'EOF'
feat(skills): add WarEra skill level meter with affordability slots

EOF
)"
```

---

### Task 4: Redesign `SkillRail` (rows + actions)

**Files:**
- Modify: `src/web/features/skills/SkillRail.tsx`
- Modify: `src/web/features/skills/SkillsPage.tsx` (prop renames only if needed in this task — prefer completing handlers in Task 5; for this task accept `onReset` / `onRestore` / `onOptimizeUnspent` / `onFullOptimize` and update call site stubs)

**Interfaces:**
- Consumes: `SkillLevelMeter`, `SkillIcon`, `SKILL_VISUALS`, `SKILL_PANEL_ORDER`, `ECO_SKILL_IDS`, `MAX_ECO_SKILL_LEVEL`, `spCostForLevel`, `totalSpForLevels`
- Produces: updated props:

```ts
type SkillRailProps = {
  levels: SkillsLevels;
  loadedSkills: Record<string, UserSkill>;
  ecoPool: number;
  availableDraft: number;
  spentEco: number;
  totalSkillPoints: number;
  availableSkillPoints: number;
  spentSkillPoints: number;
  onLevelChange: (skill: EcoSkillId, nextLevel: number) => void;
  onReset: () => void; // zero eco
  onRestore: () => void; // loaded snapshot
  onOptimizeUnspent: () => void;
  onFullOptimize: () => void;
};
```

- [ ] **Step 1: Rewrite `SkillRail.tsx`**

Key structure (full file):

```tsx
import { Coins, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_ECO_SKILL_LEVEL, spCostForLevel, totalSpForLevels, totalSpToReachLevel } from "@/skills/sp";
import { ECO_SKILL_IDS, skillValueFromLevel, type EcoSkillId } from "@/skills/values";
import type { SkillsLevels, UserSkill } from "./types";
import { formatGold, skillLabel } from "./format";
import { SkillIcon } from "./SkillIcon";
import { SkillLevelMeter } from "./SkillLevelMeter";
import { SKILL_PANEL_ORDER, SKILL_VISUALS, type SkillVisualId } from "./skillVisuals";

type SkillRailProps = {
  levels: SkillsLevels;
  loadedSkills: Record<string, UserSkill>;
  ecoPool: number;
  availableDraft: number;
  spentEco: number;
  totalSkillPoints: number;
  availableSkillPoints: number;
  spentSkillPoints: number;
  onLevelChange: (skill: EcoSkillId, nextLevel: number) => void;
  onReset: () => void;
  onRestore: () => void;
  onOptimizeUnspent: () => void;
  onFullOptimize: () => void;
};

function isEcoSkill(id: SkillVisualId): id is EcoSkillId {
  return (ECO_SKILL_IDS as string[]).includes(id);
}

export function SkillRail({
  levels,
  loadedSkills,
  ecoPool,
  availableDraft,
  spentEco,
  totalSkillPoints,
  availableSkillPoints,
  spentSkillPoints,
  onLevelChange,
  onReset,
  onRestore,
  onOptimizeUnspent,
  onFullOptimize,
}: SkillRailProps) {
  const otherSkills = Object.entries(loadedSkills)
    .filter(([id]) => !(ECO_SKILL_IDS as string[]).includes(id) && id !== "management")
    .toSorted(([a], [b]) => a.localeCompare(b));

  return (
    <aside className="space-y-4 rounded-xl border border-border bg-card/80 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="m-0 text-base font-semibold">Skills</h2>
          <p className="mt-1 mb-0 text-xs text-muted-foreground">
            Draft pool {formatGold(ecoPool, 0)} SP · spent {formatGold(spentEco, 0)} · free{" "}
            {formatGold(availableDraft, 0)}
          </p>
          <p className="mt-1 mb-0 text-xs text-muted-foreground">
            Loaded: {availableSkillPoints} available / {spentSkillPoints} spent / {totalSkillPoints}{" "}
            total
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          Reset
        </Button>
      </div>

      <ul className="m-0 list-none space-y-2.5 p-0">
        {SKILL_PANEL_ORDER.map((skillId) => {
          const visual = SKILL_VISUALS[skillId];
          const eco = isEcoSkill(skillId);
          const level = eco ? levels[skillId] : (loadedSkills.management?.level ?? 0);
          const value = eco
            ? skillValueFromLevel(skillId, level)
            : (loadedSkills.management?.value ?? 0);
          const nextCost = eco ? spCostForLevel(level + 1) : 0;
          const canUp =
            eco &&
            level < MAX_ECO_SKILL_LEVEL &&
            nextCost > 0 &&
            totalSpForLevels({ ...levels, [skillId]: level + 1 }) <= ecoPool;
          const canDown = eco && level > 0;

          return (
            <li
              key={skillId}
              className={`rounded-lg border border-border/80 bg-secondary/20 px-3 py-2.5 ${eco ? "" : "opacity-80"}`}
            >
              <div className="mb-2 flex items-center gap-2.5">
                <div
                  className="grid size-9 shrink-0 place-items-center rounded-lg"
                  style={{ background: visual.boxBackground, color: visual.color }}
                >
                  <SkillIcon skill={skillId} className="size-[18px]" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium">{visual.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {eco ? (
                      <>
                        Lv {level} · value {formatGold(value, 0)}
                        {level < MAX_ECO_SKILL_LEVEL && nextCost > 0
                          ? ` · next ${nextCost} SP`
                          : null}
                      </>
                    ) : (
                      <>read-only · Lv {level}</>
                    )}
                  </div>
                </div>
              </div>
              <SkillLevelMeter
                skill={skillId}
                level={level}
                freeSp={eco ? availableDraft : 0}
                readOnly={!eco}
                canUp={canUp}
                canDown={canDown}
                onDecrease={() => onLevelChange(skillId as EcoSkillId, level - 1)}
                onIncrease={() => onLevelChange(skillId as EcoSkillId, level + 1)}
              />
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" className="gap-1.5" onClick={onFullOptimize}>
            <Sparkles className="size-3.5" aria-hidden />
            Full Optimize
          </Button>
          <Button type="button" variant="secondary" className="gap-1.5" onClick={onOptimizeUnspent}>
            <Coins className="size-3.5" aria-hidden />
            Optimize unspent
          </Button>
        </div>
        <button
          type="button"
          className="text-center text-xs text-primary underline-offset-2 hover:underline"
          onClick={onRestore}
        >
          Restore
        </button>
      </div>

      {otherSkills.length > 0 ? (
        <details className="rounded-lg border border-border/80 bg-secondary/30 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            Other skills (read-only)
          </summary>
          <ul className="mt-2 mb-0 list-none space-y-1.5 p-0 text-sm">
            {otherSkills.map(([id, skill]) => (
              <li key={id} className="flex justify-between gap-2 text-muted-foreground">
                <span>{skillLabel(id)}</span>
                <span className="font-mono tabular-nums">
                  Lv {skill.level} · {formatGold(skill.value, 0)} · {totalSpToReachLevel(skill.level)}{" "}
                  SP
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </aside>
  );
}
```

- [ ] **Step 2: Temporarily wire `SkillsPage` to new prop names**

In `SkillsPage.tsx` `SkillRail` usage:

```tsx
onReset={handleZeroEco} // implement in Task 5; for now:
onRestore={handleReset} // old restore-to-loaded
onOptimizeUnspent={() => handleOptimize("unspent")}
onFullOptimize={() => handleOptimize("full_eco_reset")}
```

If Task 5 is done in the same session, implement real handlers immediately (preferred) so the page compiles.

- [ ] **Step 3: Clamp `setEcoLevel` to max 10**

In `SkillsPage.tsx` `setEcoLevel`:

```ts
import { MAX_ECO_SKILL_LEVEL, totalSpForLevels } from "@/skills/sp";

function setEcoLevel(skill: EcoSkillId, nextLevel: number) {
  const clamped = Math.max(0, Math.min(MAX_ECO_SKILL_LEVEL, Math.round(nextLevel)));
  setLevels((prev) => {
    const next = { ...prev, [skill]: clamped };
    if (totalSpForLevels(next) > ecoPool) return prev;
    return next;
  });
}
```

- [ ] **Step 4: Run check**

Run: `vp check`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/web/features/skills/SkillRail.tsx src/web/features/skills/SkillsPage.tsx
git commit -m "$(cat <<'EOF'
feat(skills): WarEra skill rail rows and optimize action hierarchy

EOF
)"
```

---

### Task 5: Reset vs Restore handlers

**Files:**
- Modify: `src/web/features/skills/SkillsPage.tsx`

**Interfaces:**
- Produces:
  - `handleReset`: eco levels → all `0`; does **not** touch `fullResetDraft`, `netWage`, `selfWorkCompanyId`
  - `handleRestore`: eco levels + `netWage` + `selfWorkCompanyId` from loaded user; `fullResetDraft = false`

- [ ] **Step 1: Replace handlers**

```ts
function handleReset() {
  setLevels({
    energy: 0,
    entrepreneurship: 0,
    production: 0,
    companies: 0,
  });
}

function handleRestore() {
  if (!user) return;
  setLevels(ecoLevelsFromUser(user));
  setNetWage(user.job.netWage ?? 0);
  setSelfWorkCompanyId("");
  setFullResetDraft(false);
}
```

Wire:

```tsx
onReset={handleReset}
onRestore={handleRestore}
onOptimizeUnspent={() => handleOptimize("unspent")}
onFullOptimize={() => handleOptimize("full_eco_reset")}
```

Remove the old combined `handleReset` that restored from user.

- [ ] **Step 2: Manual sanity checklist (dev server if running)**

1. Load a player → levels match loaded.
2. **Reset** → all eco Lv 0; wage/self-work unchanged; free SP rises.
3. **Restore** → back to loaded; `fullResetDraft` cleared.
4. **Full Optimize** → fills plan; label shows Full Optimize.
5. Empty boxes: with little free SP, only reachable empties at opacity 1.
6. Management appears in main list without ±; not duplicated under Other.

- [ ] **Step 3: Final verification**

Run: `vp check && vp test src/skills/sp.test.ts src/skills/optimize.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/web/features/skills/SkillsPage.tsx
git commit -m "$(cat <<'EOF'
feat(skills): split Reset (zero) and Restore (loaded snapshot)

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Icon wells + gradients + icon colors | 2, 4 |
| 10-box meter with filled icons | 3, 4 |
| Empty `#252E34` + opacity 1 / 0.2 affordability | 1 (`maxAffordableLevel`), 3 |
| Circular ±, + colored, dotted hover | 3 |
| Max level 10 UI + optimizer | 1, 4 |
| Management read-only in main list | 4 |
| Header Reset zeros eco only | 5 |
| Full Optimize + Optimize unspent side-by-side with Sparkles/Coins | 4 |
| Restore link = loaded snapshot | 5 |
| No click-to-jump | 3 (no box click handlers) |
