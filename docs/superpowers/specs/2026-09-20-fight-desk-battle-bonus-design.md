# Fight Desk battle bonus + MU damage

**Date:** 2026-09-20  
**Status:** Approved for planning  
**PR:** [#39](https://github.com/tryy3/warera-tools/pull/39) (`feat/mu-fight-desk`)  
**Parent:** [2026-09-15-mu-fight-desk-design.md](./2026-09-15-mu-fight-desk-design.md)  
**Also extends:** [Battle Info Poll](./2026-09-03-battle-info-poll-design.md), [Data Tier Caching](./2026-08-02-data-tier-caching-strategy-design.md)

**Inspiration (external):**

- [warera-build player battles](https://warera-build.duckdns.org/personal/player) — Custom typed bonus + live order cards (flags, shield, fire %, country/MU order badges)
- In-game battle card — personal damage on a fight; we want the **MU** analogue (battle-to-date), not a full scoreboard

## Goal

On Fight Desk, answer two questions without a separate Battles tab:

1. **Scenario:** If we hit *this* fight (or a typed Custom %), what do Now / Peak look like with an **accurate current MU-country bonus**?
2. **Overview:** How much damage has **this MU** already put into each relevant battle (battle-to-date)?

Replace the Advanced numeric “Battle bonus %” with a **battle card strip**. Keep food, ticks, roster selection, and Peak (7d loadout) as they are.

## Non-goals

- Allies list (warera-build Allies section)
- Per-member bonus (citizenship / location / mercenary)
- Peak-bonus / “if we set High order / turn HQ on”
- Side-total or round-scoped MU damage (scoreboard comparison)
- `battleRanking`, hit feeds, a dedicated Battles tab, Discord
- Live-scraping WarEra from the Fight Desk tab when jobs can warm the facts

## Decisions

| Topic | Choice |
| --- | --- |
| Home | Fight Desk only (not Overview, not a new tab) |
| Layout | Horizontal **card strip** above Now/Peak (layout B) |
| Card chrome | warera-build language: flags, shield/swords, order crosshairs, fire % |
| Bonus source | Jobs warm facts; pure `src/battle-bonus/` computes **current** MU-country stack |
| Applied bonus | One shared multiplier for the whole desk (`damage * (1 + total)` as today) |
| Custom | Typed fire %; no battle attached; stored separately from live selection |
| Battle list | **MU orders first**, then **country orders** for the MU’s `country_id` |
| MU damage | Sum of **latest** per-member `battle_loot_snapshots.total_dmg` for this MU; label battle-to-date |
| Side total | Out of this slice (units don’t match loot) |
| Missing hits | Show `MU —`, never a fake 0 |
| Breakdown | One line on the **selected** fight; includes applied parts, notable zeros, named penalties |
| Total-bonus trophy | Do not treat a hero “+75%” as the product; fire % is still on the card because it is the applied scenario |
| Penalties | Supply-line **−25%** when defending without capital link; add other **named** in-game penalties if found |
| Refresh | Jobs own facts; Fight Desk ↻ does not crawl all battles; knobs/selection persist |
| First visit | Select current MU-order battle if any, else Custom at 0% |
| Selected fight ends | Fall back to Custom, keep last applied % |

## Architecture

```
[Jobs]
  battle-info-poll (15m, widened relevance)
    → battles (MU order OR MU-country country order)
    → battle_scoreboard_snapshots (unchanged; unused in this UI)
    → battle_loot_snapshots (MU damage-to-date)
    → battle orders (side + Low/Med/High per country and MU)
  sibling Geo/Global warmers as needed
    → HQ running + level
    → country diplomacy (alliance, pact, sworn enemy + age)
    → alliance world-dev share
    → region bunker / attacker military base
    → revolt resistance
    → defender capital-link / supply line

[Pure]
  src/battle-bonus/  → { total, parts[] } for (mu, battle, current facts)
  src/fight-damage/  → Now/Peak using knobs.battleBonus = total (or Custom)

[API] GET /api/mu/:muId/fight-desk
  existing members + asOf
  + battles[] strip payload (inputs + precomputed bonus + muDamageToDate)

[Client]
  card strip; selectedBattleId in localStorage
  aggregateFightDesk(..., { battleBonus: selected.total | custom })
```

Jobs own Global/Geo. The Fight Desk request **reads** warm rows and runs pure math. It does not call `battle.getBattles` (or diplomacy/building procedures) on tab load. Manual ↻ still only force-refreshes MU fight snapshots as today.

Plan may extend `battle-info-poll`, add a small sibling job, or both — as long as the tab does not become the warmer.

### Data tiers

| Need | Tier | Who refreshes |
| --- | --- | --- |
| Active battles + MU/country orders + loot | Global-ish filtered by Geo MU (and MU country) | `battle-info-poll` (~15m) |
| HQ running / diplomacy / forts / capital-link / resistance | Geo (country, MU, region) | Existing or sibling jobs; cold-fill only if a pattern already exists |
| Scenario selection + Custom % | Client | `localStorage` |

### Relevance (replaces MU-orders-only)

A battle enters the workset when **either**:

- a watched MU id appears in attacker/defender `muOrders`, or
- the watched MU’s `mus.country_id` has a **country order** on that battle.

Sticky-until-finalize stays: once tracked, keep polling until finalized even if the order is pulled. The Fight Desk **strip** only lists **active** fights that currently have an MU order for this MU and/or a country order for this MU’s country (ended fights drop off the strip).

Prefer **typed columns** (or small sibling tables) for order priority, HQ running, diplomacy ramps, fort levels, resistance, and `defender_supply_linked`. JSON `payload` only for leftovers. The capital-link graph walk belongs in a job; Fight Desk reads a boolean and does not recompute the map.

## Bonus math (MU lens)

`src/battle-bonus/` is the source of truth for the stack. One call per (MU, battle):

```
{ total: number; parts: BonusPart[] }

BonusPart = { id: string; label: string; amount: number | null; status: "applied" | "off" | "unknown" }
```

`total` is the sum of `amount` for `applied` parts (penalties negative). `off` parts are 0 and still listed when they are useful (“bunker off”). `unknown` parts are **not** guessed into `total`.

**Whose bonus:** a member of **this MU** who is a citizen of **this MU’s country**, fighting on the **ordered side** (MU order side if present, else country-order side). Roster mercenaries with other citizenships are ignored for the stack. HQ still counts because they are in this MU.

**Current, not peak.** Yellow/Low order → +5% for that part. HQ spinning up or off → HQ part `off` (0). No “if High / if HQ on” projection.

**Custom:** `{ total: typedFraction, parts: [{ id: "custom", status: "applied" }] }` with no battle facts.

### Parts (named constants, golden tests)

Published guides and the wiki disagree on several rates (patriotic +10 vs +20, alliance curve). Implementation **pins constants** to in-game descriptions + live fixtures; changing a rate is a constant + test change, not a UI change.

Include at least:

| Part | When it applies (MU lens) |
| --- | --- |
| Country order | MU country has an order on this side; +5/10/15 by Low/Med/High |
| MU order | This MU has an order on this side; same tiers; stacks with country order |
| Patriotic | MU country is attacker or defender |
| Alliance | Supporting an alliance member. Share = alliance `coreDevelopment` / sum of country `coreDevelopment` (not all countries are in an alliance). Full **+20%** through **10%** share, then **−4pp per share-pp**, floored at **−20%** |
| Defensive pact | Defending a pact partner’s territory; ramp by pact age |
| Sworn enemy | Fighting the MU country’s sworn enemy; ramp by age |
| MU HQ | Headquarters **running** (not merely upgrade level); +5–20 by level |
| Bunker | Defending the battled region with an active bunker |
| Military base | Attacking from a region with an active military base |
| Resistance | Revolt, supporting attackers; scales with resistance bar |
| Supply line | Defending and the region is **not** capital-linked: **−25%** |
| Other named penalties | Only if confirmed in-game / wiki; do not invent |

Fort allied-half: confirm against live/wiki in implementation tests. If confirmed, full bunker/base for the side-owning country and half when the MU country is only supporting. If not confirmed, use full bonus whenever the MU country is on the ordered side (do not invent a half).

Unethical (double national order bonus): apply when we already persist country ethics (or can add a typed field cheaply). Skip that part (`unknown`) rather than guessing.

Parts combine as **additive percentage points**, then Fight Desk applies a **single** `(1 + total)` on projected damage (same placement as today’s `knobs.battleBonus`).

## API

`GET /api/mu/:muId/fight-desk` (and the existing refresh endpoint’s read shape) gains:

```
battles: Array<{
  id: string
  regionName: string | null
  attackerCountryId / defenderCountryId (and display names/flags as today we can resolve)
  kind: "mu_order" | "country_order" | "both"
  muOrderSide / countryOrderSide: "attacker" | "defender" | null
  muDamageToDate: number | null   // null → UI "MU —"
  bonus: { total: number; parts: BonusPart[] }
}>
```

Sort: `both` / `mu_order` first, then `country_order`. Stable secondary key: region name or battle id.

Now/Peak stay **client-computed**. Do not pre-bake desk totals on the server.

`muDamageToDate`: sum latest loot `total_dmg` for `mu_id = this MU` and `battle_id`. If no loot rows exist for any member, `null` (not 0).

## UI

Strip sits with Fight Desk controls (food, data age, ↻). Advanced battle-bonus input is **removed**; ticks stay in Advanced or nearby as today.

Each live card (warera-build chrome):

- Region name
- Attacker / defender flags; shield-and-sword for normal battles, fist if the battle is a revolt (same split as warera-build)
- Order badges: MU and/or country (this MU / this MU country)
- Fire **+X%** from `bonus.total`
- **MU {formatted}** battle-to-date, or **MU —**

Custom card: dashed empty flags, editable fire %, caption that it is typed. Selecting Custom deselects live fights.

Selected live card: highlight + one-line breakdown under the strip (`MU order +5% · HQ +15% · patriotic … · bunker off · supply OK` / `supply −25%`).

Now/Peak use:

- Live selection → `bonus.total`
- Custom → typed fraction

## Persistence

`localStorage` per `muId`; bump schema version.

Store `selectedBattleId: string | "custom"` plus existing `food`, `ticks`, `battleBonus` (**Custom typed value only**), selection presets.

Refresh / auto-refetch must not overwrite these. If `selectedBattleId` is missing from `battles[]`, treat as Custom and keep stored `battleBonus`.

First visit (no stored selection): if any `mu_order`/`both` card exists, select the first; else Custom 0%.

## Empty / stale

- No orders: strip is Custom only.
- Facts still warming: show sides/region if known; bonus parts may be `unknown`; `total` is the known sum only.
- Incomplete fight-state members: still excluded from Now/Peak (unchanged).

## Testing

- `battle-bonus`: Low vs High order; HQ off vs running; patriotic on/off; supply-line −25%; pact/enemy ramp; Custom passthrough; `unknown` excluded from `total`; `off` listed at 0.
- Prefs: migrate to `selectedBattleId`; Custom % round-trips.
- Job: country-order battles enter workset; MU-order sticky unchanged; order priority persisted.
- API: strip order; `muDamageToDate` sum of latest loot for this MU; `null` when no loot.
- UI (light): pick a fight applies that total; Custom does not attach a battle; refresh keeps selection.

## Inventory

Update `docs/warera-api/inventory.md` in the same work:

- Battles relevance includes country orders for watched MU countries
- New/extended procedures (at least `battleOrder.getByBattle`; diplomacy / upgrades / world-dev as used)
- Fight Desk consumes `battles` + `battle_loot_snapshots` (no longer “future UI”)

Do not revise `vision.md` unless architectural direction changes.

## Later hooks

- Side-total / round-scoped MU damage once units match
- Allies strip
- Per-member bonus
- Discord using the same `battle-bonus` + `fight-damage` modules
