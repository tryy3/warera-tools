# Skills Battle Build (v1) — Design

**Date:** 2026-09-06  
**Status:** Approved for implementation  
**Depends on / extends:**

- [Skills Optimizer](./2026-08-03-skills-optimizer-design.md) (Economy tab, SP model, `/skills`)
- [User data / income](./2026-08-03-user-data-income-design.md) (`GET /api/user`, shell Load/Refresh)
- [Item Market Transactions](./2026-08-04-item-market-transactions-design.md) + [Equipment Market Pricing](./2026-08-05-equipment-market-pricing-design.md) (Global sales history, skill-band matching helpers)
- [Data Tier Caching](./2026-08-02-data-tier-caching-strategy-design.md)
- WarEra api2: `user.getUserLite` (existing), `inventory.fetchCurrentEquipment` (new consumer)

**Inspiration (external):** [warera-build](https://warera-build.duckdns.org/) Economy | Battle tabs — we mirror the tab split and loadout editing loop; we diverge on pricing (fresh tax-incl medians from our tx history) and defer damage / daily operating cost.

## Goal

On `/skills`, add a **Battle** tab so a loaded player can:

1. See and edit **fight skill** levels under the same SP draft rules as Economy
2. **Import** current equipment (plus ammo/food when present) and freely tweak items/stats
3. See a trustworthy **tax-incl buy price** per slot and a loadout sum — so they can nudge stats within budget without relying on warera-build’s stale or excl-looking figures

v1 does **not** compute damage, hits/day, durability, or daily operating cost. Result panel may show placeholders for those.

## Decisions

| Topic | Choice |
| --- | --- |
| Home | Tabs on existing `/skills`: **Economy** (current page) \| **Battle** (new) |
| Architecture | Approach 1 — Battle domain module + import/quote APIs; reuse Global `item_market_transactions` |
| Import | Seed from shell-selected player, then freely tweak (skills + loadout drafts independent of Economy) |
| Fight SP | Same as Economy: edit **levels** with +/−; pool from `totalSkillPoints`; optional full combat reset (treat non-fight spend as 0) |
| Layout | **Loadout-first (C):** full-width loadout on top; fight skills + result below |
| Slots | Weapon, Helmet, Chest, Gloves, Pants, Boots, **Ammo**, **Food** |
| Price display | Tax-**incl** median only (hero). No excl in Battle v1 |
| Daily / operating cost | **Out of v1** (revisit with damage / durability) |
| Damage | Placeholder only |
| Quote window | Prefer last **24h** median when ≥ **10** matching trades; else median of **last 10** matches |
| Skill match | Exact on draft item skills first; if still thin, widen to **±1** then re-apply 24h / last-10 |
| Thin sample | If fewer than 10 after widening, still show median of available matches + count warning; if zero → null |
| Consumables | Ammo/food: `itemCode` only when txs have no skills |
| Money source | Stored tx `money` as paid (tax-incl); do not subtract tax for Battle quotes |

## Architecture

```
Shell player Load/Refresh
        │
        ├─ GET /api/user              → fight skill levels + SP (existing)
        └─ GET /api/battle-build/import → inventory.fetchCurrentEquipment → slots
                │
                v
        Battle draft (client): fight levels + loadout
                │
                │  debounce / batch on item or stats change
                v
        POST /api/battle-build/quote  → read item_market_transactions
                │
                v
        Per-slot tax-incl median + meta → Σ loadout cost
```

| Area | Location |
| --- | --- |
| Pure quote + slot/skill helpers | `src/battle-build/*` |
| Battle UI | `src/web/features/battle-build/*` |
| Economy UI (unchanged behavior) | `src/web/features/skills/*` + Economy tab shell |
| Routes | `src/server/routes/battle-build.ts` (or under skills); mount `/api/battle-build` |
| Inventory client | `src/warera/` parse + allowlist usage for `inventory.fetchCurrentEquipment` |

Economy math stays in `src/skills/*`. Do not fold Battle pricing into Equipment detail’s band UX; share low-level helpers (`matchesSkillBands`, `median`, tx reads) where they fit.

### Data tiers

| Need | Tier | Who refreshes |
| --- | --- | --- |
| Fight skills / SP | User | Shell → `GET /api/user` |
| Equipped loadout | User | Shell / Battle import → `inventory.fetchCurrentEquipment` (demand, TTL aligned with user pack ~10m) |
| Buy prices | Global | Existing `item-market-tx-*` jobs; Battle **only reads** DB |

Update `docs/warera-api/inventory.md` when import + quote consumers land (new User path + new consumer of Global txs).

## Product shape

### Routes / nav

| Label | Path | Notes |
| --- | --- | --- |
| Skills | `/skills` | Economy \| Battle tabs; search params for player unchanged |

No new shell nav item.

### Battle layout (C)

1. **Tab chrome** — ECONOMY | BATTLE (active underline; existing dark war-command styling).
2. **Loadout (full width, top)** — eight slots in order: Weapon → Helmet → Chest → Gloves → Pants → Boots → Ammo → Food.  
   Per card: item identity, cycle/select item, edit item skills/stats, **tax-incl price**, meta (`24h` \| `last10`, match count, `±1` if widened). Header: **Σ** of non-null slot prices.
3. **Fight skills (below left)** — SkillRail-style levels for: Attack, Precision, Crit Chance, Crit Damage, Armor, Dodge, Health, Loot Chance, Hunger. Map display labels to `user.getUserLite` skill keys (e.g. `criticalChance`, `lootChance` — confirm against live lite payloads during implementation). Points to spend / reset / full combat reset. Management is not part of the Battle draft.
4. **Result (below right)** — hero = Σ tax-incl loadout cost; dashed **damage placeholder** (“Coming later”). No daily cost line.

### Interactions

- Load/Refresh (or first Battle visit with a selected player) seeds fight levels from user payload and slots from import.
- Drafts for Economy and Battle are **independent**.
- Item/stat edits debounce into a **batch** quote request.
- Empty slot → no price contribution.
- Soft-fail import: keep skill draft; show message to pick equipment manually.

## APIs

### `GET /api/battle-build/import?userId=`

User-tier. Requires selected/`userId`. Calls `inventory.fetchCurrentEquipment` (api2). Returns normalized slots:

```ts
{
  slots: {
    weapon | helmet | chest | gloves | pants | boots | ammo | food
  }: null | { itemCode: string; skills: Record<string, number> }
  // plus recordedAt / soft error fields as needed
}
```

Unknown shapes map to empty slots. Soft-fail on upstream errors: **HTTP 200** with empty/partial `slots` plus an `error` / warning field so the tab stays usable (do not hard-fail the whole Battle tab).

### `POST /api/battle-build/quote`

Body: `{ items: { id: string; itemCode: string; skills: Record<string, number> | null }[] }`  
Response: per `id`: `{ median: number | null; trades: number; window: "24h" | "last10" | "thin"; widened: boolean }`.

No WarEra calls. Read `item_market_transactions` (scoped by item codes in the batch).

## Quote algorithm

For each line `{ itemCode, skills }` (skills may be empty/null for consumables):

1. Collect txs for `itemCode`, newest first.
2. **Exact match:** require every key in draft `skills` to equal the tx’s skill value (tx may have extra keys — ignore extras unless we decide otherwise: **v1 = draft keys only must match**; extra tx keys OK).
3. If exact matches with `createdAt` in last **24h** ≥ **10** → median of those; `window: "24h"`, `widened: false`.
4. Else if exact matches (any age) ≥ 10 → median of the **10 newest** exact; `window: "last10"`.
5. Else set `widened: true`, rematch with **±1** band on each draft skill key; repeat steps 3–4.
6. Else if any matches (exact or widened, as last attempted) → median of all of them; `window: "thin"`.
7. Else → `median: null`, `trades: 0`.

Consumables with no skills: skip skill filter; apply 24h / last-10 / thin on `itemCode` only (`widened: false`).

## Error handling

| Case | Behavior |
| --- | --- |
| No player | Empty draft; prompt to load |
| Import failure | Soft message; manual slot pick |
| Partial quote failure | Per-slot error; keep other prices |
| SP overspend | Same clamps as Economy SkillRail |
| Thin / null price | Show count or “no market data”; exclude nulls from Σ |

## Testing

- Unit: quote policy (24h vs last10, exact→±1, thin, consumables, empty).
- Unit: inventory → slot mapper fixtures.
- Route: quote batch; import soft-fail.
- UI: optional smoke; not blocking v1.

## Out of scope (v1)

- Damage, hits/day, burst/current modes
- Durability / daily operating cost
- Battle bonuses, orders, allies
- Budget optimizer / auto-allocate
- Share/export build links
- Tax-excl display on Battle
- Live market offers (only historical txs)

## Inventory doc

When implementing, update `docs/warera-api/inventory.md`:

- User: equipped loadout via `inventory.fetchCurrentEquipment` (Battle import)
- Global txs: add Battle quote as consumer alongside Equipment Market
