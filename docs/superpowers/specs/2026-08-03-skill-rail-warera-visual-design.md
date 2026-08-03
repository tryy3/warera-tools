# Skill rail — WarEra visual + action hierarchy

**Date:** 2026-08-03  
**Status:** Approved for planning  
**Related:** [Skills Optimizer](./2026-08-03-skills-optimizer-design.md)  
**Supersedes (actions layout):** [SkillRail action hierarchy](./2026-08-03-skill-rail-actions-hierarchy-design.md) where they conflict

## Goal

Make the Skills rail feel like the in-game skill panel (icon wells, level boxes, client colors), and put optimize front-and-center with clearer Reset vs Restore semantics.

## Visual

### Row structure (eco + Management)

1. Top: colored **icon well** + label + subcopy (`Lv N · value · next SP`).
2. Bottom: **10-slot box meter** + circular **− / +** (Management: meter only, no steppers).

### Colors (from client)

| Skill | Icon fill | Box / well / + background |
| --- | --- | --- |
| Entrepreneurship | `#E0B8D7` | `linear-gradient(45deg,#743265,#59274D)` |
| Energy | `#ABC0ED` | `linear-gradient(45deg,#1E3F88,#173168)` |
| Production | `#E1CEA5` | `linear-gradient(45deg,#705825,#56441C)` |
| Companies | `#E1CEA5` | `linear-gradient(45deg,#705825,#56441C)` |
| Management | `#C8B7E1` | `linear-gradient(45deg,#4C3076,#3B255A)` |

Icons use existing MDI paths in `skillVisuals` + `SkillIcon` (1px black drop-shadow).

### Box states

- **Filled (level achieved):** skill gradient + skill icon in the box.
- **Empty affordable:** background `#252E34`, opacity `1` — reachable with current free draft SP via cumulative `spCostForLevel` from `current+1` … target.
- **Empty unreachable:** same `#252E34`, opacity `0.2`.

### Steppers

- **−:** dark circle; hover = dotted border highlight.
- **+:** skill gradient + icon-colored glyph; hover = dotted border highlight.
- Levels clamped to **0–10** (game max). Same clamp in `optimizeEcoSkills`.

### List membership

- Main list order: Entrepreneurship, Energy, Production, Companies, Management (read-only).
- Management excluded from the “Other skills” details when shown in the main list.

## Actions

### Header

- Compact **Reset** (outline / small): set all editable eco skills to **Lv 0**. Does **not** change `fullResetDraft`, net wage, or self-work company (keeps current draft pool so manual re-placement is easy).

### Footer

1. Side-by-side primary row (Full Optimize on the left):
   - **Full Optimize** (primary gold, Lucide `Sparkles`) — was “Full eco reset”; same algorithm (`full_eco_reset`).
   - **Optimize unspent** (secondary, Lucide `Coins`).
2. Centered text link **Restore** — restore eco levels, net wage, and self-work company from the last loaded user snapshot; clears `fullResetDraft`. Replaces “Reset to loaded”.

## Behavior notes

- Affordability is computed per row against shared `availableDraft` (free SP in the current eco pool).
- `+` disabled when next level cost exceeds pool or level is already 10; `−` disabled at 0.
- No change to income formulas or optimize search strategy beyond the Lv ≤ 10 clamp.

## Implementation touchpoints

- `src/web/features/skills/skillVisuals.ts` — add `boxBackground` (and empty-slot constant).
- `src/web/features/skills/SkillRail.tsx` — WarEra rows, meter, action layout, Management row.
- `src/web/features/skills/SkillsPage.tsx` — `handleReset` (zero) vs `handleRestore` (loaded); rename Full Optimize wiring.
- `src/skills/optimize.ts` (and tests) — enforce max level 10.
- Optional small `SkillLevelMeter` component if `SkillRail` gets too dense.

## Out of scope

- Clicking empty boxes to jump to a level (steppers only for v1).
- Editing Management or other non-eco skills.
- Applying plans to the live game.
