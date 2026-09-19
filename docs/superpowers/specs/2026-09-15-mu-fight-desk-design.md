# MU Fight Desk (v1) — Design

**Date:** 2026-09-15  
**Status:** Approved for implementation  
**Depends on / extends:**

- [Data Tier Caching Strategy](./2026-08-02-data-tier-caching-strategy-design.md) (MU watchlist; jobs own Geo refresh)
- [MU Stats Poll](./2026-08-03-mu-stats-poll-design.md) + [MU Stats UI](./2026-08-24-mu-stats-ui-design.md) (`/mu/$muId` shell)
- [MU Member Activity Poll](./2026-09-04-mu-member-activity-poll-design.md) (roster-driven member snapshots; extend or sibling for fight inputs)
- [Skills Battle Build](./2026-09-06-skills-battle-build-design.md) (fight vs eco skill split; damage still placeholder there)
- Discord webhooks (`src/discord/`) — **consumer later**, not v1

**Inspiration (external):**

- [Sannas War Room](https://sannas-war-room.vercel.app/) — transparent MU damage desk (Now / Full pill-potential, food, battle bonus, ticks, selectable roster, expand-row breakdown)
- [SPYWarera](https://spywarera.com/) — pill ready/countdown, eco vs damage build, skill-reset CD in the member row

## Goal

On `/mu/$muId`, add a **Fight Desk** tab that answers:

> If we take this contract *now*, how much damage can we put out — and what’s still on the table if ready players pill?

Primary use: **contract sizing**. Secondary: early/late-day readiness (who is pilled, ready, or on debuff/reset CD) without losing scenario knobs on refresh.

## Decisions

| Topic | Choice |
| --- | --- |
| Product shape | Sanna-first desk + Spywera row cues (eco/war, skill-reset, pill timers) |
| Home | New tab on existing MU detail: Overview / Members / **Fight Desk** |
| Architecture | Shared pure fight-math + warm member snapshots; client computes totals from selection |
| Selection default | Active pill only |
| Presets | `Pilled` · `Ready` · `Pilled + Ready` · `Damage build` · `All` · `None`; then manual tweak |
| Now vs Potential | **Same selection.** Now = current state; Full pill-potential = assume +60% pill for pillable non-pilled; already pilled unchanged; debuff not pillable until timer ends |
| Refresh | Auto-refresh member **status**; do not overwrite food / battle bonus / ticks / selection |
| Persistence | `localStorage` per `muId` (+ schema version) |
| Build class | Global reusable classifier; v1 binary eco \| war from spent SP; ties → war; empty → unknown |
| Row cues | Eco/war + pill status/timer + skill-reset always visible on collapsed row |
| Totals ownership | Client (transparency); API returns inputs + `asOf`, not pre-baked MU totals |
| Discord | Out of v1; same pure math reusable for webhooks later |
| Rich builds (sustain/mixed) | Classifier API ready; UI stays eco \| war in v1 |

## Architecture

```
[Jobs / Geo-adjacent]
  watched MU roster → fight-state refresh (~5m)
       → warm per-member fight inputs
         (HP, hunger, regen, pill/debuff + timers,
          skills, military rank, ammo, last skills reset, …)

[API] GET /api/mu/:muId/fight-desk
       → roster + latest fight inputs + asOf
       (optional POST/GET force-refresh for ↻)

[Client Fight Desk]
       fight-damage (pure) + build-class (pure)
       localStorage: selection, food, battle bonus, ticks, …
       auto-refresh status; knobs untouched
```

| Area | Location (planned) |
| --- | --- |
| Pure damage math | `src/fight-damage/` |
| Eco/war classifier | `src/build-class/` (global; reusable beyond Fight Desk) |
| Warm storage / poll | Prefer extend existing member snapshot path if write cost allows; otherwise sibling fight-state table + poll. Plan picks one after field inventory. |
| API | Under `/api/mu/:muId/fight-desk` (handlers live with existing MU routes) |
| UI | `src/web/features/mu/` Fight Desk tab on `MuDetailPage` |

### Data tiers

| Need | Tier | Who refreshes |
| --- | --- | --- |
| MU roster membership | Geo | Existing MU jobs; slower OK (Sanna-like daily force is fine; ↻ available) |
| Fight inputs (HP/hunger/pill/skills/…) | Geo-adjacent | Job ~5m over watched MU members |
| Scenario knobs + selection | Client only | `localStorage` — never server |

Today’s member profile snapshots are identity/activity-heavy and **do not** yet carry full fight inputs. v1 must add warm storage for calculator fields. Demand live-fill only on miss/stale (same Geo pattern); poll remains the bulk writer.

### Manual refresh (↻)

Forces roster + fight-state pull without clearing localStorage knobs or selection.

### Auto-refresh

Client refetch of fight-desk status on an interval aligned with snapshot freshness (target **~1–5 min**, not faster than the job). Refetch replaces member inputs only; localStorage knobs/selection stay.

## Fight math (v1 semantics)

Source of truth for formulas: Sannas War Room documented behavior (aligned below). Implementation must unit-test these rules; if live WarEra field mapping differs, adapt parsers — not the disclosed math — unless we discover a confirmed game-rule correction.

### Inputs (per player, “just now”)

- Current HP and hunger (not max-only); regen rates for tick projection
- ATK already includes military rank bonus, pill buff/debuff, and ammo (as provided per player)
- Precision, crit %, crit damage %, armor, dodge
- Food choice (global control) and battle bonus (Advanced — battle-dependent, user-entered)
- Ticks = hours forward: project HP/hunger via regen, capped at max

### Formulas

```
dmg/hit = precision × (crit% × ATK × (1 + critDmg%) + (1 - crit%) × ATK)
        + (1 - precision) × ATK × 0.5

max hits = (HP + hunger × foodBonus × maxHP) / hpLossPerHit

hpLossPerHit uses armor + dodge with diminishing returns:
  total / (total + 40)
```

Pin `hpLossPerHit` constants in the pure module from Sanna’s diminishing-returns curve (`total / (total + 40)` over armor+dodge); lock with golden tests before UI polish.

**Battle bonus:** user-entered in Advanced (not fetched). Apply as a global multiplier on projected player damage the same way Sanna’s Advanced control does; confirm the exact factor placement (vs ATK vs final damage) during implementation against Sanna’s output on a fixed fixture roster.

### Now vs Full pill-potential

| Mode | Rule |
| --- | --- |
| **Now** | Selected players at current pill/debuff/HP/hunger (after ticks projection). Damage = what the group can fight with if they enter battle under that projection. |
| **Full pill-potential** | Same selection. Players with an **active pill** counted as-is (no extra uplift). Players **without** pill status (ready / can pill) counted as if they took a pill (**+60% ATK**). Players in **debuff/nedtrappning** are **not** pillable until the debuff ends — no uplift. |

### Pill UI cues

- Purple dot at level badge: active pill
- Red dot: debuff / come-down
- Header counts: active / debuff / ready (can take pill)
- Expand row: full breakdown (ATK, mil rank %, precision, crit, crit dmg, armor, dodge, hunger, ammo, dmg/hit, ticks-related figures, pill name + timer)

## Build class (global)

v1 classifier (pure, shared):

1. Sum spent SP in **eco** skills vs **fight/war** skills (reuse the same skill id split as Battle Build / skills optimizer).
2. `ecoSp > warSp` → `eco`
3. `warSp > ecoSp` → `war`
4. Tie → `war`
5. No usable skills → `unknown`

Future (out of v1 UI): extend to `sustain` / `mixed` etc. without rewriting Fight Desk — only the classifier and optional richer badges.

Skill-reset: show **Available** or countdown from `last_skills_reset_at` (already on member snapshots). Cooldown length is a named constant in `build-class` or fight-desk helpers, confirmed against live WarEra / Spywera before ship — not hard-coded silently in UI strings.

## UI & behavior

### Layout

1. **Header** — MU name; pill counts `active / debuff / ready`; data age; ↻
2. **Controls** — Food select; Advanced (battle bonus, ticks); selection presets
3. **Summary cards** — Now | Full pill-potential | Members selected | Avg / member | Top damage
4. **Roster** — checkbox, rank, level + pill dot, name, eco/war icon, pill status/timer, skill-reset, HP + hunger bars, **Now** damage for that player under current knobs; if not actively pilled, show secondary “if pill” damage (Sanna-style); expand for detail

### Selection & presets

- First visit (no stored selection): check **active pill** only
- Preset click replaces the selected id set
- Manual check/uncheck persists across refresh and auto-refresh
- **New members** while a custom selection is stored: start **unchecked** until the user applies a preset or checks them
- Summary cards count **checked** players only

### Persistence (`localStorage`)

Keyed by `muId` + schema version. Store at least:

- `food`, `battleBonus`, `ticks`
- `selectedUserIds`
- `lastPresetId` (optional; informational)
- `expandedUserIds` (optional)

Auto-refresh **must not** overwrite these knobs.

### Incomplete members

If required fight fields are missing, **exclude** the player from totals and show a clear incomplete badge — do not invent zeros.

### Empty / unwarmed MU

Empty state when roster or fight snapshots are missing; if watchlist is required for Geo warm-up, point to existing watch/follow UX.

## Out of scope (v1)

- Discord bot or announcement flows (reuse math + webhook later)
- Replacing Overview / Members charts
- Server-side precomputed MU damage totals as source of truth
- Rich build taxonomy UI (sustain/mixed)
- Auth-synced presets

## Testing

- Unit: `fight-damage` — dmg/hit, max hits, armor/dodge curve, ticks cap at max, Now vs Full-pill, debuff not uplifted, food + battle bonus
- Unit: `build-class` — eco vs war SP; ties → war; empty → unknown
- Unit: selection presets + localStorage schema version migrate
- API: fight-desk payload shape; stale/missing fields → exclude + badge semantics
- UI (light): default pilled selection; refresh keeps knobs/selection; preset then manual tweak persists

## Later hooks

- Discord webhook: post Now / Potential for current preset using the same pure modules
- Richer `build-class` labels
- Optional server-side preset sync once auth exists
- Battle tab on `/skills` can eventually share `fight-damage` for single-player estimates
