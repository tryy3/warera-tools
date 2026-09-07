# Skills Battle Build (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Economy | Battle tabs on `/skills` so a loaded player can draft fight skills, import/tweak gear+ammo+food, and see tax-incl buy medians (24h≥10 else last-10, exact then ±1) with a loadout sum and damage placeholder.

**Architecture:** Pure quote + fight-skill helpers in `src/battle-build/`; WarEra inventory client in `src/warera/`; Hono `/api/battle-build` for import (User) + quote (Global txs); Battle UI under `src/web/features/battle-build/` composed behind tabs on the existing Skills route. Economy behavior stays in `src/web/features/skills/` unchanged aside from tab chrome.

**Tech Stack:** TypeScript, Hono, Drizzle/libSQL, Vitest via `vp test`, Vite+ (`vp check`), TanStack Router / Query, existing `item_market_transactions` + `src/equipment/skills` / `median`.

**Design:** [2026-09-06-skills-battle-build-design.md](../specs/2026-09-06-skills-battle-build-design.md)

## Global Constraints

- Tabs on `/skills` only — no new shell nav item
- Tax-**incl** medians only; no daily/operating cost; damage is placeholder
- Quote: 24h median if ≥10 matches; else last 10; exact skills first, then ±1 widen
- Draft keys must match tx skills; extra tx skill keys OK
- Import soft-fails with HTTP 200 + error field
- Fight SP: triangular costs via existing `src/skills/sp.ts`; independent Battle draft; optional full combat reset
- Slots: weapon, helmet, chest, gloves, pants, boots, ammo, food
- Prefer `vp test path` / `vp check`; commit after each task
- Update `docs/warera-api/inventory.md` when import/quote land
- Mark `inventory.fetchCurrentEquipment` used-here in `.agents/skills/warera-api/procedures.md`

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/battle-build/fight-skills.ts` | Fight skill ids, labels, empty levels, non-fight SP helper |
| `src/battle-build/slots.ts` | Slot id union, order, empty loadout, consumable catalogs |
| `src/battle-build/quote.ts` | Pure quote algorithm |
| `src/battle-build/map-inventory.ts` | Raw inventory → normalized slots |
| `src/battle-build/index.ts` | Public exports |
| `src/battle-build/*.test.ts` | Unit tests |
| `src/db/item-market-tx-read.ts` | Add `listItemMarketTxForItemCodes` |
| `src/warera/inventory.ts` | `fetchCurrentEquipment` + parse |
| `src/warera/inventory.test.ts` | Parser fixtures |
| `src/warera/index.ts` | Re-export inventory |
| `src/server/routes/battle-build.ts` | `GET /import`, `POST /quote` |
| `src/server/routes/battle-build.test.ts` | Route tests |
| `src/server/app.ts` | Mount `/api/battle-build` |
| `src/web/query/keys.ts` | `battleBuildImport` key |
| `src/web/query/useBattleBuildImportQuery.ts` | Import hook |
| `src/web/query/quoteBattleBuild.ts` | POST quote helper |
| `src/web/lib/skillsSearch.ts` | Optional `tab` search param |
| `src/web/features/skills/EconomyTab.tsx` | Current SkillsPage body extracted |
| `src/web/features/skills/SkillsPage.tsx` | Tab chrome + Economy \| Battle |
| `src/web/features/battle-build/*` | BattleTab, LoadoutRow, SlotCard, FightSkillRail, ResultPanel |
| `docs/warera-api/inventory.md` | New User row + Global consumer |
| `.agents/skills/warera-api/procedures.md` | used-here yes for inventory |

---

### Task 1: Fight skill ids + SP pool helpers

**Files:**
- Create: `src/battle-build/fight-skills.ts`
- Create: `src/battle-build/fight-skills.test.ts`
- Create: `src/battle-build/index.ts`

**Interfaces:**
- Consumes: `totalSpToReachLevel`, `totalSpForLevels` from `src/skills/sp.ts`
- Produces:
  - `export type FightSkillId = "attack" | "precision" | "criticalChance" | "criticalDamages" | "armor" | "dodge" | "health" | "lootChance" | "hunger"`
  - `export const FIGHT_SKILL_IDS: FightSkillId[]` (display order)
  - `export const FIGHT_SKILL_LABELS: Record<FightSkillId, string>`
  - `export type FightLevels = Record<FightSkillId, number>`
  - `export function emptyFightLevels(): FightLevels`
  - `export function fightLevelsFromUserSkills(skills: Record<string, { level: number }>): FightLevels`
  - `export function spentNonFightSp(skills: Record<string, { level: number }>): number` — sum SP for keys **not** in `FIGHT_SKILL_IDS`
  - `export const MAX_FIGHT_SKILL_LEVEL = 200`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vite-plus/test";
import {
  FIGHT_SKILL_IDS,
  emptyFightLevels,
  fightLevelsFromUserSkills,
  spentNonFightSp,
} from "./fight-skills";

describe("fightLevelsFromUserSkills", () => {
  it("reads known keys and defaults missing to 0", () => {
    expect(fightLevelsFromUserSkills({ attack: { level: 5 }, energy: { level: 3 } })).toMatchObject({
      attack: 5,
      precision: 0,
    });
  });
});

describe("spentNonFightSp", () => {
  it("counts eco spend only", () => {
    // energy 2 = 3 SP; attack 2 ignored
    expect(
      spentNonFightSp({
        energy: { level: 2 },
        attack: { level: 2 },
      }),
    ).toBe(3);
  });
});

describe("FIGHT_SKILL_IDS", () => {
  it("has nine skills", () => {
    expect(FIGHT_SKILL_IDS).toHaveLength(9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/battle-build/fight-skills.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement**

```ts
import { totalSpToReachLevel } from "../skills/sp";

export type FightSkillId =
  | "attack"
  | "precision"
  | "criticalChance"
  | "criticalDamages"
  | "armor"
  | "dodge"
  | "health"
  | "lootChance"
  | "hunger";

export const FIGHT_SKILL_IDS: FightSkillId[] = [
  "attack",
  "precision",
  "criticalChance",
  "criticalDamages",
  "armor",
  "dodge",
  "health",
  "lootChance",
  "hunger",
];

export const FIGHT_SKILL_LABELS: Record<FightSkillId, string> = {
  attack: "Attack",
  precision: "Precision",
  criticalChance: "Crit. chance",
  criticalDamages: "Crit. damages",
  armor: "Armor",
  dodge: "Dodge",
  health: "Health",
  lootChance: "Loot chance",
  hunger: "Hunger",
};

export const MAX_FIGHT_SKILL_LEVEL = 200;

export type FightLevels = Record<FightSkillId, number>;

export function emptyFightLevels(): FightLevels {
  return {
    attack: 0,
    precision: 0,
    criticalChance: 0,
    criticalDamages: 0,
    armor: 0,
    dodge: 0,
    health: 0,
    lootChance: 0,
    hunger: 0,
  };
}

export function fightLevelsFromUserSkills(
  skills: Record<string, { level: number }>,
): FightLevels {
  const out = emptyFightLevels();
  for (const id of FIGHT_SKILL_IDS) {
    const level = skills[id]?.level;
    if (typeof level === "number" && Number.isFinite(level)) {
      out[id] = Math.max(0, Math.floor(level));
    }
  }
  return out;
}

export function spentNonFightSp(skills: Record<string, { level: number }>): number {
  const fight = new Set<string>(FIGHT_SKILL_IDS);
  let sum = 0;
  for (const [id, skill] of Object.entries(skills)) {
    if (fight.has(id)) continue;
    sum += totalSpToReachLevel(skill.level);
  }
  return sum;
}
```

`src/battle-build/index.ts`: re-export fight-skills.

**Note:** If live `user.getUserLite` uses different keys (e.g. `critChance`), add aliases in `fightLevelsFromUserSkills` once confirmed — do not invent keys without a fixture.

- [ ] **Step 4: Run tests — expect PASS**

Run: `vp test src/battle-build/fight-skills.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/battle-build/fight-skills.ts src/battle-build/fight-skills.test.ts src/battle-build/index.ts
git commit -m "feat(battle-build): fight skill ids and SP pool helpers"
```

---

### Task 2: Slot model + consumable catalogs

**Files:**
- Create: `src/battle-build/slots.ts`
- Create: `src/battle-build/slots.test.ts`
- Modify: `src/battle-build/index.ts`

**Interfaces:**
- Consumes: `equipmentSlot`, `ITEM_CODE_TIER_OVERRIDES` / armor code patterns from `src/equipment/catalog.ts` where useful
- Produces:
  - `export type LoadoutSlotId = "weapon" | "helmet" | "chest" | "gloves" | "pants" | "boots" | "ammo" | "food"`
  - `export const LOADOUT_SLOT_ORDER: LoadoutSlotId[]`
  - `export type LoadoutItem = { itemCode: string; skills: Record<string, number> }`
  - `export type Loadout = Record<LoadoutSlotId, LoadoutItem | null>`
  - `export function emptyLoadout(): Loadout`
  - `export const AMMO_CODES = ["lightAmmo", "ammo", "heavyAmmo"] as const`
  - `export const FOOD_CODES = ["bread", "steak", "cookedFish"] as const`
  - `export function cycleCodes(codes: readonly string[], current: string | null, dir: 1 | -1): string`
  - `export function gearCodesForSlot(slot: Exclude<LoadoutSlotId, "ammo" | "food">): string[]` — weapons from `ITEM_CODE_TIER_OVERRIDES` keys; armor `{slot}1`…`{slot}6`

- [ ] **Step 1: Write failing tests** for `emptyLoadout`, `cycleCodes`, `gearCodesForSlot("weapon")` includes `sniper`, `gearCodesForSlot("helmet")` includes `helmet6`.

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/battle-build/slots.test.ts`

- [ ] **Step 3: Implement** `slots.ts` as above (armor codes: `helmet1`…`helmet6`, same for chest/gloves/pants/boots).

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/battle-build/slots.ts src/battle-build/slots.test.ts src/battle-build/index.ts
git commit -m "feat(battle-build): loadout slots and item catalogs"
```

---

### Task 3: Quote algorithm (pure)

**Files:**
- Create: `src/battle-build/quote.ts`
- Create: `src/battle-build/quote.test.ts`
- Modify: `src/battle-build/index.ts`

**Interfaces:**
- Consumes: `median` from `src/equipment/median.ts`; `parseSkillNumbers`, `matchesSkillBands` from `src/equipment/skills.ts`
- Produces:
  - `export type QuoteWindow = "24h" | "last10" | "thin"`
  - `export type QuoteLineInput = { id: string; itemCode: string; skills: Record<string, number> | null }`
  - `export type QuoteLineResult = { id: string; median: number | null; trades: number; window: QuoteWindow; widened: boolean }`
  - `export type QuoteTx = { money: number; createdAtMs: number; skills: Record<string, number> }`
  - `export function quoteItem(input: { itemCode: string; skills: Record<string, number> | null; txs: QuoteTx[]; nowMs: number }): Omit<QuoteLineResult, "id">`
  - `export function quoteBatch(items: QuoteLineInput[], txsByCode: Map<string, QuoteTx[]>, nowMs: number): QuoteLineResult[]`
  - `export const QUOTE_MIN_TRADES = 10`
  - `export const QUOTE_24H_MS = 24 * 60 * 60 * 1000`

**Algorithm** (must match design):

1. Filter `txs` for the item (caller may pre-filter).
2. If `skills` null/empty → all txs match; `widened` stays false.
3. Else exact: draft keys must equal tx values (`matchesSkillBands` with `band: 0`).
4. Prefer 24h subset if `length >= 10` → median, `window: "24h"`.
5. Else if exact (all ages) `length >= 10` → median of **10 newest**, `window: "last10"`.
6. Else rematch with `band: 1`, set `widened: true`, repeat 4–5.
7. Else if any matches from last attempt → median of all, `window: "thin"`.
8. Else null / trades 0 / `window: "thin"`.

- [ ] **Step 1: Write failing tests** covering: 24h≥10; fall back last10; exact→±1; thin; consumable no skills; empty.

```ts
import { describe, expect, it } from "vite-plus/test";
import { quoteItem } from "./quote";

const hour = 3600_000;

function tx(money: number, ageMs: number, skills: Record<string, number> = {}) {
  return { money, createdAtMs: 1_000_000_000_000 - ageMs, skills };
}

describe("quoteItem", () => {
  const now = 1_000_000_000_000;

  it("uses 24h median when >=10 exact matches", () => {
    const txs = Array.from({ length: 10 }, (_, i) =>
      tx(10 + i, i * hour, { attack: 90 }),
    );
    const r = quoteItem({ itemCode: "sniper", skills: { attack: 90 }, txs, nowMs: now });
    expect(r.window).toBe("24h");
    expect(r.widened).toBe(false);
    expect(r.trades).toBe(10);
    expect(r.median).toBe(14.5); // 10..19
  });

  it("falls back to last 10 when 24h is thin", () => {
    const txs = [
      ...Array.from({ length: 3 }, (_, i) => tx(100, i * hour, { attack: 90 })),
      ...Array.from({ length: 10 }, (_, i) => tx(50, (30 + i) * hour, { attack: 90 })),
    ];
    const r = quoteItem({ itemCode: "sniper", skills: { attack: 90 }, txs, nowMs: now });
    expect(r.window).toBe("last10");
    expect(r.trades).toBe(10);
  });

  it("widens to ±1 when exact is thin", () => {
    const txs = Array.from({ length: 10 }, (_, i) =>
      tx(20, (30 + i) * hour, { attack: 91 }),
    );
    const r = quoteItem({ itemCode: "sniper", skills: { attack: 90 }, txs, nowMs: now });
    expect(r.widened).toBe(true);
    expect(r.window).toBe("last10");
    expect(r.median).not.toBeNull();
  });

  it("quotes consumables without skills", () => {
    const txs = Array.from({ length: 10 }, (_, i) => tx(1 + i * 0.1, i * hour));
    const r = quoteItem({ itemCode: "ammo", skills: null, txs, nowMs: now });
    expect(r.widened).toBe(false);
    expect(r.window).toBe("24h");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/battle-build/quote.test.ts`

- [ ] **Step 3: Implement** `quote.ts` using `matchesSkillBands` + `median`. Sort matches newest-first before taking last 10.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/battle-build/quote.ts src/battle-build/quote.test.ts src/battle-build/index.ts
git commit -m "feat(battle-build): tax-incl quote policy (24h / last10 / ±1)"
```

---

### Task 4: DB read by item codes

**Files:**
- Modify: `src/db/item-market-tx-read.ts`
- Modify: `src/db/item-market-tx-read.test.ts`

**Interfaces:**
- Produces: `export async function listItemMarketTxForItemCodes(db: Db, itemCodes: string[]): Promise<ItemMarketTxRow[]>`
  - Empty `itemCodes` → `[]`
  - `inArray(itemMarketTransactions.itemCode, unique)`
  - No time filter (quote needs old trades for last-10)

- [ ] **Step 1: Extend existing test file** — insert txs for two codes; assert filter returns only requested codes.

- [ ] **Step 2: Run — expect FAIL** on missing export

Run: `vp test src/db/item-market-tx-read.test.ts`

- [ ] **Step 3: Implement** with `inArray` from drizzle-orm.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/db/item-market-tx-read.ts src/db/item-market-tx-read.test.ts
git commit -m "feat(db): list item-market txs by item codes"
```

---

### Task 5: WarEra inventory fetch + slot mapper

**Files:**
- Create: `src/warera/inventory.ts`
- Create: `src/warera/inventory.test.ts`
- Create: `src/battle-build/map-inventory.ts`
- Create: `src/battle-build/map-inventory.test.ts`
- Modify: `src/warera/index.ts`
- Modify: `.agents/skills/warera-api/procedures.md` (set `inventory.fetchCurrentEquipment` used-here to **yes**)

**Interfaces:**
- Produces:
  - `export async function fetchCurrentEquipment(warera: WareraRequester, userId: string): Promise<unknown>` — `warera.request(wareraProcedurePath("inventory.fetchCurrentEquipment", { userId }))` then `unwrapTrpcData`
  - `export function parseInventoryEquipment(raw: unknown): ParsedInventoryItem[]` where `ParsedInventoryItem = { itemCode: string; skills: Record<string, number>; slotHint: string | null }`
  - `export function mapInventoryToLoadout(items: ParsedInventoryItem[]): { loadout: Loadout; warnings: string[] }` in `map-inventory.ts`

**Parser strategy (resilient):** Accept array at root, or `items` / `equipment` / `slots` object. Per entry read `itemCode` / `code` / `item.code`; skills via `parseSkillNumbers`; slot hint from `slot` / `type` / catalog `equipmentSlot(itemCode)`. Ammo/food: if code in `AMMO_CODES` / `FOOD_CODES`, map those slots. First wins per slot; extras → warnings.

- [ ] **Step 1: Write parser + mapper tests** with fixtures (array of equipment; object map; unknown junk → empty + warning).

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement** fetch + parse + map. If live shape differs when you probe api2, update fixtures — do not block on perfect docs.

Optional probe (if `WARERA_API_KEY` / bearer available):

```bash
curl -sS -G 'https://api2.warera.io/trpc/inventory.fetchCurrentEquipment' \
  --data-urlencode 'input={"userId":"<id>"}' -H "Authorization: Bearer $TOKEN" | head
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/warera/inventory.ts src/warera/inventory.test.ts src/warera/index.ts \
  src/battle-build/map-inventory.ts src/battle-build/map-inventory.test.ts \
  .agents/skills/warera-api/procedures.md
git commit -m "feat(warera): fetchCurrentEquipment parse and loadout map"
```

---

### Task 6: Hono routes — quote + import

**Files:**
- Create: `src/server/routes/battle-build.ts`
- Create: `src/server/routes/battle-build.test.ts`
- Modify: `src/server/app.ts`

**Interfaces:**
- `battleBuildRoutes(deps: { db: Db; warera: WareraRequester; logger: Logger })`
- `GET /import?userId=` → `{ slots: Loadout; error: string | null; recordedAt: string }` — always 200 when `userId` present; on WarEra failure `error` set and empty loadout
- `POST /quote` JSON body `{ items: QuoteLineInput[] }` → `{ results: QuoteLineResult[]; quotedAt: string }`
  - Validate array; max 16 items; reject missing `id`/`itemCode` with 400
  - Load txs via `listItemMarketTxForItemCodes`; group by code; map to `QuoteTx`; call `quoteBatch`

Mount: `app.route("/api/battle-build", battleBuildRoutes(...))`

- [ ] **Step 1: Write route tests** (mirror `equipment.test.ts` in-memory DB):
  - quote returns 24h median for seeded txs
  - import soft-fails when warera throws (mock request rejects) → 200 + error string
  - quote 400 on bad body

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/server/routes/battle-build.test.ts`

- [ ] **Step 3: Implement** routes + mount in `app.ts`.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/battle-build.ts src/server/routes/battle-build.test.ts src/server/app.ts
git commit -m "feat(api): battle-build import and quote routes"
```

---

### Task 7: Client query helpers + tab search

**Files:**
- Modify: `src/web/query/keys.ts` — add `battleBuildImport: (userId: string) => ["battle-build-import", userId] as const`
- Create: `src/web/query/useBattleBuildImportQuery.ts`
- Create: `src/web/query/quoteBattleBuild.ts`
- Modify: `src/web/lib/skillsSearch.ts` + tests if present
- Modify: `src/web/routes/skills.tsx` validateSearch
- Modify: player load invalidation if there is a central invalidate list (e.g. `loadPlayerData`) to also invalidate `battleBuildImport`

**Interfaces:**
- `useBattleBuildImportQuery(userId: string | null)` → `GET /api/battle-build/import?userId=`
- `quoteBattleBuild(items: QuoteLineInput[]): Promise<QuoteLineResult[]>` → `POST /api/battle-build/quote` via existing `api()` helper
- Search: `tab?: "economy" | "battle"` (default economy when absent)

- [ ] **Step 1: Implement** keys, hooks, search parse/build (follow `useUserQuery` patterns).

- [ ] **Step 2: Add/adjust unit test** for `parseSkillsSearch` tab field if `skillsSearch` has tests; else skip.

- [ ] **Step 3: Commit**

```bash
git add src/web/query/keys.ts src/web/query/useBattleBuildImportQuery.ts \
  src/web/query/quoteBattleBuild.ts src/web/lib/skillsSearch.ts src/web/routes/skills.tsx
git commit -m "feat(web): battle-build query hooks and skills tab search"
```

---

### Task 8: Skills page tab chrome + extract Economy

**Files:**
- Create: `src/web/features/skills/EconomyTab.tsx` — move current SkillsPage body (header “Economy objective”, SkillRail, IncomeStack)
- Modify: `src/web/features/skills/SkillsPage.tsx` — Economy | Battle tabs; render `EconomyTab` or `BattleTab`
- Create: `src/web/features/battle-build/BattleTab.tsx` — stub: “Battle — loading…” / placeholder layout C skeleton

**UI notes:**
- Tab buttons: uppercase tracking, active = red/top border consistent with war-command (use existing border/primary tokens; avoid purple glow)
- Preserve player sync + `useUserQuery` at SkillsPage level; pass `user` into both tabs as needed
- Battle tab receives `user` + import query

- [ ] **Step 1: Extract EconomyTab without behavior change** — manually smoke `/skills` still works.

- [ ] **Step 2: Add tab switch** wired to `search.tab` via navigate.

- [ ] **Step 3: Stub BattleTab** with loadout-first grid placeholders.

- [ ] **Step 4: Commit**

```bash
git add src/web/features/skills/EconomyTab.tsx src/web/features/skills/SkillsPage.tsx \
  src/web/features/battle-build/BattleTab.tsx
git commit -m "feat(skills): Economy/Battle tabs with Battle stub"
```

---

### Task 9: Battle loadout UI + live quotes

**Files:**
- Create: `src/web/features/battle-build/LoadoutRow.tsx`
- Create: `src/web/features/battle-build/SlotCard.tsx`
- Create: `src/web/features/battle-build/useLoadoutQuotes.ts` (debounce ~300ms → `quoteBattleBuild`)
- Modify: `src/web/features/battle-build/BattleTab.tsx`

**Behavior:**
- Seed loadout from import when `userId` + import data arrives (ref key like Skills applyUser)
- SlotCard: icon/name (`formatEquipmentItem` / media if easy), prev/next item via `cycleCodes` / `gearCodesForSlot`, −/+ on each skill key present (default skill keys from item or lowest known: weapons `attack`+`criticalChance`, armor slot-typical keys — start with skills from imported item; if empty gear, use `{ attack: 0 }` for weapon / `{ armor: 0 }` for armor pieces)
- Show tax-incl median, meta (`24h`/`last10`/`thin`, trades, `±1` badge)
- Header Σ = sum of non-null medians
- Empty slot: clear button / “empty”; no quote line

- [ ] **Step 1: Implement** SlotCard + LoadoutRow + debounce hook.

- [ ] **Step 2: Wire** into BattleTab top section.

- [ ] **Step 3: Manual check** — change stats, confirm quote updates; thin sample shows count.

- [ ] **Step 4: Commit**

```bash
git add src/web/features/battle-build/
git commit -m "feat(battle-build): loadout cards with live tax-incl quotes"
```

---

### Task 10: Fight skill rail + result panel

**Files:**
- Create: `src/web/features/battle-build/FightSkillRail.tsx` — reuse `SkillLevelMeter` / button patterns from Economy `SkillRail`; fight ids + labels; Reset / Restore / Full combat reset (set `fullCombatReset` flag like Economy)
- Create: `src/web/features/battle-build/ResultPanel.tsx` — Σ gold hero; dashed “Damage — coming later”
- Modify: `BattleTab.tsx` — below loadout: grid FightSkillRail | ResultPanel
- Reuse SP: `fightPool = fullCombatReset ? totalSP : totalSP - spentNonFightSp`; clamp level changes with `totalSpForLevels`

- [ ] **Step 1: Implement** FightSkillRail with +/− guards.

- [ ] **Step 2: Implement** ResultPanel using quote Σ from parent state.

- [ ] **Step 3: Seed fight levels from `fightLevelsFromUserSkills(user.skills)` on user apply.

- [ ] **Step 4: Commit**

```bash
git add src/web/features/battle-build/
git commit -m "feat(battle-build): fight skill rail and result placeholder"
```

---

### Task 11: Inventory doc + final check

**Files:**
- Modify: `docs/warera-api/inventory.md`
  - User table: add row **Equipped loadout** — `inventory.fetchCurrentEquipment`, demand on Battle import / Load, TTL aligned with user pack, consumer Battle tab
  - Global item-market txs consumers: add Battle quote
- Run `vp check` and targeted `vp test` for battle-build + routes

- [ ] **Step 1: Update inventory.md**

- [ ] **Step 2: Run**

```bash
vp test src/battle-build src/server/routes/battle-build.test.ts src/db/item-market-tx-read.test.ts src/warera/inventory.test.ts
vp check
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add docs/warera-api/inventory.md
git commit -m "docs(warera-api): inventory for battle-build import and quotes"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Economy \| Battle on `/skills` | 8 |
| Fight skills + SP / full combat reset | 1, 10 |
| Import + tweak | 5, 6, 7, 9 |
| Gear + ammo + food | 2, 9 |
| Tax-incl 24h≥10 else last10; exact→±1 | 3, 4, 6 |
| Loadout-first layout C | 8–10 |
| Damage placeholder; no daily cost | 10 |
| Soft-fail import | 6 |
| inventory.md update | 11 |
| procedures used-here | 5 |

**Out of v1 (intentionally no task):** damage math, durability daily cost, battle bonuses, optimizer, share links, tax-excl.

**Type consistency:** `Loadout` / `QuoteLineInput` / `FightLevels` names are shared across tasks 1–3 and routes/UI as defined above.
