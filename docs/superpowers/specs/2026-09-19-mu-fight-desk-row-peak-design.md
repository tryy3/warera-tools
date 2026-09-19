# MU Fight Desk row polish + 7d Peak potential

**Date:** 2026-09-19  
**Status:** Approved for planning  
**PR:** [#39](https://github.com/tryy3/warera-tools/pull/39) (`feat/mu-fight-desk`)  
**Parent:** [2026-09-15-mu-fight-desk-design.md](./2026-09-15-mu-fight-desk-design.md)

## Goal

Tighten Fight Desk member rows for contract sizing: Spywera-style pill timers, compact HP/Hunger with both numbers, remove skills-reset cues, and replace “If pill / Full pill-potential” with a **7-day Peak** estimate based on the highest-ATK snapshot (Full pill projection with current knobs).

## Non-goals

- Skills-reset availability / cooldown anywhere on Fight Desk UI
- Averaging stats across the window, or Frankensteining per-stat maxima
- Scoring every historical snapshot with full damage math
- Battle participation / overtime damage views (separate future work)
- New peak side-table or client-fetched 7d history dumps
- Changing snapshot retention / pruning policy

## Decisions

| Topic | Choice |
| --- | --- |
| Skills-reset | Remove from Fight Desk UI entirely (row + expanded); prefer omit from fight-desk API response if unused |
| Resources | One stacked HP + Hunger slot; show `current/max` for both |
| Pill placement | Under the damage block (with Now + Peak) |
| Pill style | Ready = muted text; Pilled = green + pill icon + timer; Debuff = red + pill icon + timer |
| Secondary damage | **Peak** replaces “If pill …” |
| Peak pick | Rolling 7 days; snapshot with highest `atk`; tie → newest `recorded_at` |
| Peak project | Full pill-potential with **current** knobs; always apply pill ATK bonus; Peak uses **full** hp/hunger on the peak loadout |
| Cold start | If only latest (or empty history beyond latest), Peak = Full-pill projection of current snapshot |
| Data path | Resolve peak on Fight Desk GET via DB helper; no new table |

## Metrics

### Now

Unchanged: latest fight snapshot + knobs + **actual** pill state (no fake pill bonus while debuffed).

### Peak

1. Consider `user_fight_snapshots` for that user with `recorded_at >= now - 7d` (include latest).
2. Select the row with maximum `atk` (tie-break `recorded_at` desc).
3. Build a fight input from that row’s **combat loadout** (atk, precision, crit, armor, dodge, maxHp, maxHunger, regens, military rank / ammo as used by existing math).
4. For Peak only, treat resources as **full** (`hp = maxHp`, `hunger = maxHunger`) so a days-old mid-fight bar does not understate potential.
5. Project with current knobs using **Full pill** rules: always apply pill ATK bonus (do not reuse today’s `playerDamageIfPill` ready-only gate as-is — Peak must not understate morning debuff peaks).
6. Incomplete / no snapshot → Peak `null`.

**Why max ATK, not max projected damage:** cheap and good enough; avoids O(snapshots) full projections for ~25-member MUs over a week of polls. Tradeoff: a slightly lower-ATK / higher-def loadout could win in true damage but lose the pick.

## Row UI

Right-side damage stack:

1. **Now** (primary)
2. **Peak** (secondary, e.g. `Peak 159 858`)
3. Spywera pill line

HP/Hunger: stacked thin bars in one column; numbers for both (unlike Sanna’s hunger-only-guess).

Drop the skills-reset column and any mobile “Reset …” concatenation.

Keep war/eco build icons and incomplete / refresh-failed badges.

## API / server

- `GET /api/mu/:muId/fight-desk` continues to return latest `fight` for Now.
- Add per-member **peak fight input / loadout** (inputs, not a pre-baked damage total) resolved in the route/DB layer with one efficient query over the 7d window (existing `(user_id, recorded_at)` index). Client projects Peak with current knobs, matching the parent design’s “API returns inputs” rule.
- Prefer removing `lastSkillsResetAt` from the fight-desk response payload if nothing on the tab consumes it; keep `skills-reset` module for other callers.
- Summary card “Full pill-potential” → **Peak** (sum of selected members’ Peak).
- Sort option “Potential” sorts by Peak.

## Client

- `FightDeskMemberRow`: stacked `ResourceBar`s; Spywera pill; Peak label; no reset.
- `fightDeskMemberRows` / tab summary: `potentialDamage` semantics become Peak (rename in code if clarity helps).
- Live countdowns for pill timers unchanged (tab-level `nowMs`).

## Testing

- Peak picker: highest `atk`, tie-break, single-snapshot cold start, empty → null
- Full-pill helper: applies bonus regardless of snapshot `pillStatus`
- Row tests: no reset copy; both resource numbers; pill class/text by status; Peak shown
- Summary / sort use Peak
- Route test: peak loadout attached for roster members when history exists

## Out of scope follow-ups

- Battle damage done / which battles / overtime charts (noted on PR #39)
- Smarter peak scoring (true projected damage) if ATK heuristic proves weak
- Separating volatile HP/hunger from combat fingerprints in snapshot pruning (existing TODO)
