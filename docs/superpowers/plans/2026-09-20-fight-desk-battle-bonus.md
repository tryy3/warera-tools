# Fight Desk Battle Bonus + MU Damage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Fight Desk’s typed Advanced battle bonus with a warera-build-style battle card strip that applies an accurate **current MU-country** bonus and shows **MU battle-to-date** damage.

**Architecture:** Jobs warm battle/order/diplomacy/fort/supply facts. Pure `src/battle-bonus/` sums the current stack. `GET /api/mu/:muId/fight-desk` attaches a `battles[]` strip (bonus + loot sum). The client selects a card (or Custom) and feeds `knobs.battleBonus`; Now/Peak stay client-computed.

**Tech Stack:** TypeScript, Hono, Drizzle/Postgres, Vitest via `vp test`, Vite+ (`vp check` / `vp run db:generate`), TanStack Query, existing `src/fight-damage/`, `src/jobs/battle-info-poll/`, `FlagIcon`.

**Design:** [2026-09-20-fight-desk-battle-bonus-design.md](../specs/2026-09-20-fight-desk-battle-bonus-design.md)

## Global Constraints

- Jobs own Global/Geo. Fight Desk **must not** call `battle.getBattles`, `battleOrder.getByBattle`, diplomacy, or region building APIs on tab load. Manual ↻ still only refreshes MU fight snapshots.
- One shared bonus for the desk: MU-country lens, **current** facts only (yellow order = +5% now). No peak-bonus mode.
- `computeBattleBonus` returns `{ total, parts }`. `unknown` parts are omitted from `total`. `off` parts are 0 and may still appear in the breakdown.
- Additive percentage points, then existing `damage * (1 + knobs.battleBonus)`.
- MU damage = sum of **latest** loot `total_dmg` for this `mu_id` + battle. No loot rows → `null` → UI `MU —` (never `0`).
- Strip lists **active** fights with a current MU order for this MU and/or a country order for this MU’s `country_id`. MU-order cards first.
- Client owns Now/Peak totals. API returns strip **inputs** (bonus already computed from warm facts; loot already summed).
- Prefer typed columns / small sibling tables. JSON `payload` for leftovers only.
- Supply-line penalty is **−0.25** when defending and `defenderSupplyLinked === false`. `null` link → part `unknown`, not −25%.
- Pin rate constants in `src/battle-bonus/constants.ts`. Wiki vs guide disagreements are constant changes + tests, not UI changes.
- `vp test path/to/file.test.ts`; `vp check` before considering a UI task done. Commit after each task.
- Working tree may already have unrelated WIP under `src/fight-damage/`, `src/warera/fight-state.ts`, `src/lib/formatDisplayNumber.ts` — do **not** discard or mix it into these commits.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/battle-bonus/constants.ts` | Named rates (orders, patriotic, HQ, forts, supply, ramps, alliance curve) |
| `src/battle-bonus/types.ts` | `BattleBonusFacts`, `BonusPart`, `OrderPriority`, `BattleSide` |
| `src/battle-bonus/compute.ts` | `computeBattleBonus`, `customBattleBonus` |
| `src/battle-bonus/compute.test.ts` | Golden stack tests |
| `src/battle-bonus/index.ts` | Re-exports |
| `src/warera/battles.ts` | Parse `countryOrders` on sides; keep `muOrders` |
| `src/warera/battle-orders.ts` | `parseBattleOrders` + `fetchBattleOrders` (`battleOrder.getByBattle`) |
| `src/warera/diplomacy.ts` | Parse country diplomacy + alliance world-dev share |
| `src/warera/region-combat.ts` | Parse bunker / military base / resistance / neighbors from `region.getById` |
| `src/db/schema.ts` | Country-order columns, `battle_orders`, `battle_bonus_facts`, `country_diplomacy` |
| `drizzle/0002_*.sql` + meta | Migration via `vp run db:generate` |
| `src/db/test/postgres.ts` | Truncate new tables first |
| `src/db/battles.ts` | Persist country order id lists |
| `src/db/battle-orders.ts` | Replace-set current orders per battle |
| `src/db/battle-bonus-facts.ts` | Upsert per-battle fort/supply/resistance |
| `src/db/country-diplomacy.ts` | Upsert latest diplomacy |
| `src/db/battle-strip.ts` | List strip rows + latest MU loot sums |
| `src/jobs/battle-info-poll/relevance.ts` | Pure: which watched MUs stick to a battle |
| `src/jobs/battle-info-poll/run.ts` | Widen discovery; fetch orders + bonus facts for workset |
| `src/server/routes/mu-fight-desk.ts` | Attach `battles[]` |
| `src/web/features/mu/types.ts` | `MuFightDeskBattle` on the response |
| `src/web/lib/fightDeskPrefs.ts` | v2 + `selectedBattleId` |
| `src/web/features/mu/FightDeskBattleStrip.tsx` | Card strip + Custom + breakdown |
| `src/web/features/mu/FightDeskTab.tsx` | Remove Advanced bonus input; wire strip → knobs |
| `docs/warera-api/inventory.md` | Country-order tracking; Fight Desk consumes loot |
| `.agents/skills/warera-api/procedures.md` | Mark new procedures `used here: yes` |

---

### Task 1: Pure battle-bonus stack

**Files:**
- Create: `src/battle-bonus/constants.ts`
- Create: `src/battle-bonus/types.ts`
- Create: `src/battle-bonus/compute.ts`
- Create: `src/battle-bonus/compute.test.ts`
- Create: `src/battle-bonus/index.ts`

**Interfaces:**
- Consumes: nothing (no I/O)
- Produces:
  - `export type BattleSide = "attacker" | "defender"`
  - `export type OrderPriority = "low" | "medium" | "high"`
  - `export type BonusPart = { id: string; label: string; amount: number | null; status: "applied" | "off" | "unknown" }`
  - `export type BattleBonusResult = { total: number; parts: BonusPart[] }`
  - `export type BattleBonusFacts` (fields listed in the test fixture below)
  - `export function computeBattleBonus(facts: BattleBonusFacts): BattleBonusResult`
  - `export function customBattleBonus(total: number): BattleBonusResult`

- [ ] **Step 1: Write the failing tests**

Create `src/battle-bonus/compute.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { computeBattleBonus, customBattleBonus } from "./compute";
import type { BattleBonusFacts } from "./types";

function facts(patch: Partial<BattleBonusFacts> = {}): BattleBonusFacts {
  return {
    fightSide: "attacker",
    muCountryId: "sweden",
    attackerCountryId: "iran",
    defenderCountryId: "egypt",
    isRevolt: false,
    countryOrderPriority: null,
    muOrderPriority: null,
    hqLevel: 3,
    hqRunning: false,
    allianceWorldShare: null,
    defendingPactPartner: null,
    swornEnemy: null,
    bunkerLevel: null,
    bunkerActive: null,
    militaryBaseLevel: null,
    militaryBaseActive: false,
    resistance: null,
    defenderSupplyLinked: true,
    alliedFortHalf: false,
    ...patch,
  };
}

function amount(result: ReturnType<typeof computeBattleBonus>, id: string): number | null | undefined {
  return result.parts.find((p) => p.id === id)?.amount;
}

function status(result: ReturnType<typeof computeBattleBonus>, id: string) {
  return result.parts.find((p) => p.id === id)?.status;
}

describe("computeBattleBonus", () => {
  it("applies Low MU order as +5% and does not invent High", () => {
    const result = computeBattleBonus(facts({ muOrderPriority: "low" }));
    expect(amount(result, "mu_order")).toBe(0.05);
    expect(result.total).toBeCloseTo(0.05);
  });

  it("stacks country High + MU Low", () => {
    const result = computeBattleBonus(
      facts({ countryOrderPriority: "high", muOrderPriority: "low" }),
    );
    expect(amount(result, "country_order")).toBe(0.15);
    expect(amount(result, "mu_order")).toBe(0.05);
    expect(result.total).toBeCloseTo(0.2);
  });

  it("applies patriotic when MU country is a side", () => {
    const result = computeBattleBonus(facts({ muCountryId: "iran" }));
    expect(amount(result, "patriotic")).toBe(0.2);
    expect(status(result, "patriotic")).toBe("applied");
  });

  it("marks HQ off when not running even if level is 3", () => {
    const result = computeBattleBonus(facts({ hqLevel: 3, hqRunning: false }));
    expect(status(result, "hq")).toBe("off");
    expect(amount(result, "hq")).toBe(0);
    expect(result.total).toBe(0);
  });

  it("applies HQ +15% at running level 3", () => {
    const result = computeBattleBonus(facts({ hqLevel: 3, hqRunning: true }));
    expect(amount(result, "hq")).toBe(0.15);
  });

  it("treats unknown HQ running as unknown, not as on", () => {
    const result = computeBattleBonus(facts({ hqLevel: 4, hqRunning: null }));
    expect(status(result, "hq")).toBe("unknown");
    expect(result.total).toBe(0);
  });

  it("applies supply-line −25% only when defending and unlinked", () => {
    const hit = computeBattleBonus(
      facts({ fightSide: "defender", defenderSupplyLinked: false }),
    );
    expect(amount(hit, "supply_line")).toBe(-0.25);
    const unknown = computeBattleBonus(
      facts({ fightSide: "defender", defenderSupplyLinked: null }),
    );
    expect(status(unknown, "supply_line")).toBe("unknown");
    expect(unknown.total).toBe(0);
  });

  it("ramps defensive pact by age days, capped at +10%", () => {
    const result = computeBattleBonus(facts({ defendingPactPartner: { ageDays: 12 } }));
    expect(amount(result, "defensive_pact")).toBe(0.1);
  });

  it("excludes unknown alliance share from total", () => {
    const result = computeBattleBonus(facts({ allianceWorldShare: null }));
    expect(status(result, "alliance")).toBe("unknown");
    expect(result.total).toBe(0);
  });
});

describe("customBattleBonus", () => {
  it("passthrough typed fraction with a custom part", () => {
    expect(customBattleBonus(0.6)).toEqual({
      total: 0.6,
      parts: [{ id: "custom", label: "Custom", amount: 0.6, status: "applied" }],
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `vp test src/battle-bonus/compute.test.ts`

Expected: FAIL (module not found / exports missing)

- [ ] **Step 3: Implement constants, types, and compute**

`src/battle-bonus/constants.ts`:

```ts
export const ORDER_BONUS = { low: 0.05, medium: 0.1, high: 0.15 } as const;
export const PATRIOTIC_BONUS = 0.2;
export const HQ_BONUS_BY_LEVEL = [0, 0.05, 0.1, 0.15, 0.2] as const;
export const FORT_BONUS_PER_LEVEL = 0.05;
export const FORT_BONUS_MAX = 0.25;
export const SUPPLY_LINE_PENALTY = -0.25;
export const RESISTANCE_MAX = 0.3;
export const RAMP_PER_DAY = 0.01;
export const RAMP_MAX = 0.1;

/** v0.25 alliance curve: full +10% at share ≤ 15%; −0.5pp per share-pp over 15%; 0 at ≥ 35%. */
export function allianceBonusFromWorldShare(share: number): number {
  if (share <= 0.15) return 0.1;
  if (share >= 0.35) return 0;
  return 0.1 - (share - 0.15) * 0.5;
}
```

`src/battle-bonus/types.ts` — export the types from the Interfaces block. `BattleBonusFacts` fields must match the test fixture.

`src/battle-bonus/compute.ts` — walk parts in a stable order: `country_order`, `mu_order`, `patriotic`, `alliance`, `defensive_pact`, `sworn_enemy`, `hq`, `bunker`, `military_base`, `resistance`, `supply_line`.

Rules:

- Order parts: `null` priority → `off` / 0 (no order). Else `applied` with `ORDER_BONUS[priority]`.
- Patriotic: `applied` + `PATRIOTIC_BONUS` if `muCountryId` equals attacker or defender id; else `off` / 0.
- Alliance: `allianceWorldShare == null` → `unknown` / `amount: null`; else `applied` with `allianceBonusFromWorldShare`.
- Pact / sworn: `null` → `off` / 0; else `applied` with `min(RAMP_MAX, max(RAMP_PER_DAY, ageDays * RAMP_PER_DAY))` using at least day 1 = 1%.
- HQ: `hqRunning === null` → `unknown`; `hqRunning === false` → `off` / 0; else `HQ_BONUS_BY_LEVEL[hqLevel]` (clamp 1–4, missing level → `unknown`).
- Bunker: only if `fightSide === "defender"`. Inactive → `off`. Active level → `min(FORT_BONUS_MAX, level * FORT_BONUS_PER_LEVEL)`, halved if `alliedFortHalf`.
- Military base: only if `fightSide === "attacker"`. Same level math.
- Resistance: only if `isRevolt && fightSide === "attacker"`. `resistance == null` → `unknown`; else `RESISTANCE_MAX * resistance`.
- Supply: only if `fightSide === "defender"`. `defenderSupplyLinked === true` → `off` / 0; `false` → `applied` `SUPPLY_LINE_PENALTY`; `null` → `unknown`.
- `total` = sum of `amount` for `status === "applied"` only (treat `null` as 0).

`customBattleBonus(total)` as in the test.

`src/battle-bonus/index.ts`: `export * from "./compute"; export * from "./constants"; export type * from "./types";`

- [ ] **Step 4: Run tests**

Run: `vp test src/battle-bonus/compute.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/battle-bonus
git commit -m "$(cat <<'EOF'
feat: add pure MU-country battle bonus stack

EOF
)"
```

---

### Task 2: Parse country orders on battle sides

Country orders can be issued by a **third** country (Sweden ordering Crete while Iran fights Egypt). Parse `countryOrders` string[] on each side, same shape as `muOrders`.

**Files:**
- Modify: `src/warera/battles.ts`
- Modify: `src/warera/battles.test.ts`

**Interfaces:**
- Consumes: existing `parseBattleListItem` / `ParsedBattleSide`
- Produces: `ParsedBattleSide.countryOrders: string[]`

- [ ] **Step 1: Write the failing test**

In `src/warera/battles.test.ts`, extend `battleListFixture.attacker` with `countryOrders: ["sweden"]` and assert:

```ts
expect(parsed!.attacker.countryOrders).toEqual(["sweden"]);
expect(parsed!.defender.countryOrders).toEqual([]);
```

Also add a case where `countryOrders` is missing → `[]`.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/warera/battles.test.ts`

Expected: FAIL (`countryOrders` undefined)

- [ ] **Step 3: Parse countryOrders**

In `parseSide` (`src/warera/battles.ts`):

```ts
muOrders: pickStringList(obj.muOrders),
countryOrders: pickStringList(obj.countryOrders ?? obj.countryOrderIds),
```

Add `countryOrders` to `ParsedBattleSide`. Do **not** add those keys to `KNOWN_BATTLE_KEYS` at the top level (they live on sides). If a live payload uses a different key, add it to `pickStringList` fallbacks and a fixture — do not leave the field always empty.

- [ ] **Step 4: Run tests**

Run: `vp test src/warera/battles.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/warera/battles.ts src/warera/battles.test.ts
git commit -m "$(cat <<'EOF'
feat: parse battle side countryOrders

EOF
)"
```

---

### Task 3: `battleOrder.getByBattle` client

Needed for **priority** (Low/Med/High), not just presence.

**Files:**
- Create: `src/warera/battle-orders.ts`
- Create: `src/warera/battle-orders.test.ts`
- Modify: `.agents/skills/warera-api/procedures.md` (set `battleOrder.getByBattle` used here = yes)

**Interfaces:**
- Consumes: `wareraProcedurePath`, `unwrapTrpcData`, `WareraRequester`
- Produces:
  - `export type ParsedBattleOrder = { ownerType: "mu" | "country"; ownerId: string; side: BattleSide; priority: OrderPriority; payload: Record<string, unknown> | null }`
  - `export function parseBattleOrders(raw: unknown): ParsedBattleOrder[]`
  - `export async function fetchBattleOrders(warera: WareraRequester, battleId: string): Promise<ParsedBattleOrder[]>`

- [ ] **Step 1: Write the failing tests**

Create `src/warera/battle-orders.test.ts` with a fixture covering array-or-wrapped `orders`/`items`, `mu`/`muId` vs `country`/`countryId`, `priority: "low"|"medium"|"high"` and numeric `1|2|3`, `side: "attacker"|"defender"`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { parseBattleOrders } from "./battle-orders";

it("parses MU and country orders with Low/High priority", () => {
  const parsed = parseBattleOrders({
    orders: [
      { mu: "mu-1", side: "attacker", priority: "low" },
      { country: "sweden", side: "attacker", priority: "high" },
    ],
  });
  expect(parsed).toEqual([
    { ownerType: "mu", ownerId: "mu-1", side: "attacker", priority: "low", payload: null },
    { ownerType: "country", ownerId: "sweden", side: "attacker", priority: "high", payload: null },
  ]);
});

it("maps numeric priority 2 to medium and drops rows without owner", () => {
  expect(
    parseBattleOrders([{ countryId: "c1", side: "defender", priority: 2 }, { side: "attacker" }]),
  ).toEqual([
    { ownerType: "country", ownerId: "c1", side: "defender", priority: "medium", payload: null },
  ]);
});
```

If a captured live `battleOrder.getByBattle` body differs, **change the fixture to the live shape** and keep the `ParsedBattleOrder` output type stable.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/warera/battle-orders.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement parser + fetch**

`fetchBattleOrders`:

```ts
const json = await warera.request<unknown>(
  wareraProcedurePath("battleOrder.getByBattle", { battleId }),
);
return parseBattleOrders(unwrapTrpcData(json));
```

Accept raw array **or** `{ orders | items | battleOrders: unknown[] }`. Owner: first of `mu`/`muId` → `mu`; else `country`/`countryId` → `country`. Priority map: `low|1` → low, `medium|2` → medium, `high|3` → high; unknown priority → skip row. Side must be `attacker`|`defender`.

- [ ] **Step 4: Run tests**

Run: `vp test src/warera/battle-orders.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/warera/battle-orders.ts src/warera/battle-orders.test.ts .agents/skills/warera-api/procedures.md
git commit -m "$(cat <<'EOF'
feat: parse battleOrder.getByBattle priorities

EOF
)"
```

---

### Task 4: Schema for orders, bonus facts, diplomacy

**Files:**
- Modify: `src/db/schema.ts` (`battles` + new tables)
- Create: `drizzle/0002_*.sql` + `drizzle/meta/*` via `vp run db:generate`
- Modify: `src/db/test/postgres.ts` (`TRUNCATE_SQL` — new tables **before** `battles`)

**Interfaces:**
- Produces tables:
  - `battles.attacker_country_orders` / `defender_country_orders` `jsonb string[] | null`
  - `battle_orders`: `battle_id`, `owner_type` (`mu`|`country`), `owner_id`, `side`, `priority`, `fetched_at` — PK `(battle_id, owner_type, owner_id)`
  - `battle_bonus_facts`: PK `battle_id` → `is_revolt`, `bunker_level`, `bunker_active`, `military_base_level`, `military_base_active`, `resistance` (0–1 double), `defender_supply_linked` (bool|null), `attacker_region_id`, `defender_region_id`, `fetched_at`
  - `country_diplomacy`: PK `country_id` → `alliance_id`, `alliance_world_share`, `sworn_enemy_id`, `sworn_enemy_since`, `defensive_pacts` jsonb `Array<{ countryId: string; since: string }>`, `fetched_at`

- [ ] **Step 1: Add Drizzle tables**

On `battles` (next to existing mu order columns):

```ts
attackerCountryOrders: jsonb("attacker_country_orders").$type<string[] | null>(),
defenderCountryOrders: jsonb("defender_country_orders").$type<string[] | null>(),
```

Add `battleOrders`, `battleBonusFacts`, `countryDiplomacy` `pgTable`s with the columns above. FK `battle_id` → `battles.id`. Indexes: `battle_orders_owner_idx (owner_type, owner_id)`, `country_diplomacy_alliance_idx (alliance_id)`.

- [ ] **Step 2: Generate migration**

Run: `vp run db:generate`

Expected: `drizzle/0002_*.sql` (next after `0001_living_lady_vermin`) plus journal/snapshot updates.

- [ ] **Step 3: Truncate order**

Prepend to `TRUNCATE_SQL`:

```
  battle_orders,
  battle_bonus_facts,
  country_diplomacy,
```

(before `battle_loot_snapshots` / `battles` as needed so FKs drop cleanly — list child tables first).

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts src/db/test/postgres.ts drizzle
git commit -m "$(cat <<'EOF'
feat: schema for battle orders, bonus facts, and diplomacy

EOF
)"
```

---

### Task 5: DB helpers + relevance

**Files:**
- Modify: `src/db/battles.ts` (persist country order arrays)
- Create: `src/db/battle-orders.ts` + `src/db/battle-orders.test.ts`
- Create: `src/db/battle-bonus-facts.ts`
- Create: `src/db/country-diplomacy.ts`
- Create: `src/db/battle-strip.ts` + `src/db/battle-strip.test.ts`
- Create: `src/jobs/battle-info-poll/relevance.ts` + `src/jobs/battle-info-poll/relevance.test.ts`

**Interfaces:**
- Consumes: `ParsedBattle`, `ParsedBattleOrder`, `BattleBonusFacts` row shape
- Produces:
  - `relevantStickyMuIds(battle, watched: Array<{ muId: string; countryId: string | null }>): string[]`
  - `replaceBattleOrders(db, battleId, orders: ParsedBattleOrder[], fetchedAt: Date): Promise<void>`
  - `listBattleOrders(db, battleId: string): Promise<ParsedBattleOrder[]>` (map DB rows back)
  - `upsertBattleBonusFacts(db, battleId, facts): Promise<void>`
  - `upsertCountryDiplomacy(db, row): Promise<void>`
  - `listFightDeskBattles(db, muId: string): Promise<BattleStripRow[]>`
  - `listLatestMuDamageByBattle(db, muId: string, battleIds: string[]): Promise<Map<string, number>>`

`BattleStripRow` = active battle where this MU is in current muOrders **or** this MU’s country is in current countryOrders / `battle_orders`, plus identity fields (ids, regions, countries, type).

`listLatestMuDamageByBattle`: for each battle, take the loot snapshot with max `(recorded_at, id)` per `(battle_id, user_id)` where `mu_id = muId`, then **sum** `total_dmg` (skip nulls). If **no** rows for that battle, omit the key (caller maps to `null`).

- [ ] **Step 1: Failing relevance + loot-sum tests**

`relevance.test.ts`:

```ts
it("sticks watched MUs on muOrders or matching countryOrders", () => {
  const battle = {
    attacker: { muOrders: ["mu-a"], countryOrders: ["sweden"] },
    defender: { muOrders: [], countryOrders: [] },
  } as never;
  expect(
    relevantStickyMuIds(battle, [
      { muId: "mu-a", countryId: "iran" },
      { muId: "mu-se", countryId: "sweden" },
      { muId: "mu-other", countryId: "chile" },
    ]),
  ).toEqual(["mu-a", "mu-se"]);
});
```

`battle-strip.test.ts` (Postgres): seed MU `mu-1` country `sweden`; battle with defender country orders including `sweden`; two loot polls for user A (100 then 250) and user B (50); expect `listLatestMuDamageByBattle` → `250+50=300`. Battle with no loot → key absent.

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/jobs/battle-info-poll/relevance.test.ts src/db/battle-strip.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement helpers**

`relevantStickyMuIds`: union of watched `muId` in either side’s `muOrders`, plus watched rows whose `countryId` is in either side’s `countryOrders`. Sort for stability.

`replaceBattleOrders`: `delete` where `battle_id`, then `insert` the new set (empty set = clear).

Persist country order arrays in `upsertBattleFromParsed` from `parsed.attacker.countryOrders` / defender.

`listFightDeskBattles`: `battles.is_active = true` AND (muId in attacker/defender mu order json **or** mu.countryId in country order json **or** a `battle_orders` row for that mu/country). Use Postgres `?` jsonb containment or `inArray` after loading — pick the approach that is easy to test; correctness over clever SQL.

Latest loot: distinct-on or `inner join` of max recorded_at subquery; follow existing `listPeakFightStatesForUsers` style in `src/db/user-fight-state.ts`.

- [ ] **Step 4: Run tests**

Run: `vp test src/jobs/battle-info-poll/relevance.test.ts src/db/battle-strip.test.ts src/db/battles.test.ts src/db/battle-orders.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/battles.ts src/db/battle-orders.ts src/db/battle-orders.test.ts \
  src/db/battle-bonus-facts.ts src/db/country-diplomacy.ts src/db/battle-strip.ts \
  src/db/battle-strip.test.ts src/jobs/battle-info-poll/relevance.ts \
  src/jobs/battle-info-poll/relevance.test.ts
git commit -m "$(cat <<'EOF'
feat: store battle orders and sum latest MU loot

EOF
)"
```

---

### Task 6: Widen `battle-info-poll` and persist orders

**Files:**
- Modify: `src/jobs/battle-info-poll/run.ts`
- Modify: `src/jobs/battle-info-poll/run.test.ts`
- Modify: `src/db/mus.ts` if needed to load `{ muId, countryId }` for watched MUs

**Interfaces:**
- Consumes: `relevantStickyMuIds`, `fetchBattleOrders`, `replaceBattleOrders`, existing poll loop
- Produces: country-order battles enter sticky workset; `battle_orders` replaced each poll for workset battles

- [ ] **Step 1: Failing job test**

In `run.test.ts`, seed watched MU `mu-se` with `countryId: "sweden"` and **no** muOrders on the battle. Battle attacker `countryOrders: ["sweden"]`. Mock `battle.getBattles` + `battleOrder.getByBattle` returning High country order for sweden/attacker.

Expect: `battles` row exists, sticky includes `mu-se`, `battle_orders` has country/sweden/high/attacker.

Keep the existing MU-order discovery test passing.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/jobs/battle-info-poll/run.test.ts`

Expected: FAIL (country-order battle not tracked)

- [ ] **Step 3: Wire discovery + order fetch**

Load watched MUs as `{ muId, countryId }[]` (join `mus` for country).

Phase 1: for each active battle, `hit = relevantStickyMuIds(b, watched)`; if `hit.length === 0` skip; else upsert with those sticky ids.

For every workset battle still active (and settling, same as loot): `fetchBattleOrders` → `replaceBattleOrders`. Fetch errors → poll `partial`, keep previous orders.

Do **not** live-fill orders from Fight Desk.

- [ ] **Step 4: Run tests**

Run: `vp test src/jobs/battle-info-poll/run.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/jobs/battle-info-poll/run.ts src/jobs/battle-info-poll/run.test.ts src/db/mus.ts
git commit -m "$(cat <<'EOF'
feat: track country-order battles and persist order priority

EOF
)"
```

---

### Task 7: Warm HQ, diplomacy, forts, supply-link

Still inside `battle-info-poll` (workset-bounded). HQ running is derived from `mus.activeUpgradeLevels.headquarters` (number 1–4 ⇒ running at that level; missing/0 ⇒ not running). If later live data shows a separate spinning-up flag, add it as `hqRunning: null` (unknown) — do not treat “has upgrade level” as running without the `activeUpgradeLevels` name.

**Files:**
- Create: `src/warera/diplomacy.ts` + `src/warera/diplomacy.test.ts`
- Create: `src/warera/region-combat.ts` + `src/warera/region-combat.test.ts`
- Modify: `src/jobs/battle-info-poll/run.ts` + `run.test.ts`
- Modify: `.agents/skills/warera-api/procedures.md` (`countryDiplomacy.getByCountry`, `alliance.getById` or `getByIds`, `gameStat.getWorldDevelopment`, `region.getById` used here as applicable)

**Interfaces:**
- Produces:
  - `parseCountryDiplomacy(raw) → { allianceId, swornEnemyId, swornEnemySince, pacts: Array<{ countryId, since }> }`
  - `parseRegionCombat(raw) → { bunkerLevel, bunkerActive, militaryBaseLevel, militaryBaseActive, resistance: number | null, neighborRegionIds: string[], ownerCountryId, isCore }`
  - Poll upserts `country_diplomacy` once per distinct MU country in the workset
  - Poll upserts `battle_bonus_facts` per workset battle
  - `defender_supply_linked`: BFS from defender region to that country’s capital through same-owner neighbor ids; if capital or neighbors unknown → `null`

Pin parser keys with fixtures. If live `region.getById` / diplomacy bodies differ, replace the fixture keys and keep the parsed types stable.

Alliance share: `gameStat.getWorldDevelopment` once per poll + alliance totals if the payload has them; store `alliance_world_share` on `country_diplomacy` (0–1). If share cannot be computed, store `null`.

- [ ] **Step 1: Failing parser tests**

Minimal fixtures: pact with `since` 9 days ago; bunker active level 4; region neighbors `["r2"]`; diplomacy sworn enemy.

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/warera/diplomacy.test.ts src/warera/region-combat.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement parsers + poll fetches**

After orders in the workset loop (active battles only):

1. Distinct MU countries for sticky MUs → `countryDiplomacy.getByCountry` (skip if already fetched this run).
2. `region.getById` for defender region (always) and attacker region (military base). Reuse `fetchRegionById` if `src/warera/` already has it; otherwise add a thin wrapper around existing region client.
3. Compute supply link; `upsertBattleBonusFacts`.
4. Individual fetch failures → `partial`; leave previous facts row in place.

Capital region id: from country payload if present (`capital` / `capitalRegionId`); else `defender_supply_linked = null`.

- [ ] **Step 4: Job test**

Mock region + diplomacy on a defender-unlinked battle; expect `battle_bonus_facts.defender_supply_linked === false`.

Run: `vp test src/jobs/battle-info-poll/run.test.ts src/warera/diplomacy.test.ts src/warera/region-combat.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/warera/diplomacy.ts src/warera/diplomacy.test.ts \
  src/warera/region-combat.ts src/warera/region-combat.test.ts \
  src/jobs/battle-info-poll src/db/battle-bonus-facts.ts src/db/country-diplomacy.ts \
  .agents/skills/warera-api/procedures.md
git commit -m "$(cat <<'EOF'
feat: warm battle bonus facts from diplomacy and regions

EOF
)"
```

---

### Task 8: Fight Desk API `battles[]`

**Files:**
- Create: `src/server/fight-desk-battles.ts` (assemble strip; keep route thin)
- Create: `src/server/fight-desk-battles.test.ts` **or** extend `src/server/routes/mu-fight-desk.test.ts`
- Modify: `src/server/routes/mu-fight-desk.ts`
- Modify: `src/web/features/mu/types.ts`
- Modify: `src/server/routes/mu-fight-desk.test.ts`

**Interfaces:**
- Consumes: `listFightDeskBattles`, `listBattleOrders`, `listLatestMuDamageByBattle`, `computeBattleBonus`, `mus` (country, `activeUpgradeLevels`), `country_diplomacy`, `battle_bonus_facts`, `countries` (iso/name)
- Produces response field:

```ts
export type MuFightDeskBattle = {
  id: string;
  regionName: string | null;
  attackerCountryId: string | null;
  defenderCountryId: string | null;
  attackerIsoCode: string | null;
  defenderIsoCode: string | null;
  kind: "mu_order" | "country_order" | "both";
  muOrderSide: "attacker" | "defender" | null;
  countryOrderSide: "attacker" | "defender" | null;
  isRevolt: boolean;
  muDamageToDate: number | null;
  bonus: BattleBonusResult;
};

export type MuFightDeskResponse = {
  mu: { id: string; name: string | null };
  asOf: string | null;
  members: MuFightDeskMember[];
  battles: MuFightDeskBattle[];
  meta: { watched: boolean; liveFilled: boolean; refreshFailedUserIds: string[] };
};
```

`fightSide` for compute: `muOrderSide ?? countryOrderSide ?? "attacker"`.

`kind`: both if this MU has an MU order **and** this MU country has a country order; else whichever is present.

Sort: `both`/`mu_order` first, then `country_order`; secondary `regionName` then `id`.

HQ facts: `hqLevel = Number(mus.activeUpgradeLevels.headquarters)` if finite 1–4; `hqRunning = hqLevel != null` (see Task 7 pin).

`alliedFortHalf = true` when MU country is **not** the owner of the ordered side (attacker/defender country id). Until live confirms half forts, still pass the flag into `computeBattleBonus`; constants already implement half when the flag is true. If Task 7 tests against wiki show full bonus for supporters, set `alliedFortHalf: false` always and add a comment + test.

Do not call WarEra from `respond()`.

- [ ] **Step 1: Failing API test**

Seed: MU `mu-1` country `sweden`, HQ level 3 running; battle Crete with MU order low attacker + country order high attacker; loot latest 12_400_000; patriotic off (sweden not a side). GET `/mu-1/fight-desk` → `battles[0].kind === "both"`, `muDamageToDate === 12400000`, `bonus.parts` includes `mu_order` 0.05 and `hq` 0.15, `bonus.total` matches compute.

Empty loot → `muDamageToDate === null`.

Existing member tests must still pass (`battles` may be `[]`).

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/server/routes/mu-fight-desk.test.ts`

Expected: FAIL (`battles` missing)

- [ ] **Step 3: Assemble + attach**

`src/server/fight-desk-battles.ts` exports `async function loadFightDeskBattles(db, muId): Promise<MuFightDeskBattle[]>`.

Call it from `respond()` and add `battles` to the JSON. Resolve region names from `regions.name` by defender/attacker region id.

- [ ] **Step 4: Run tests**

Run: `vp test src/server/routes/mu-fight-desk.test.ts src/server/fight-desk-battles.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/fight-desk-battles.ts src/server/fight-desk-battles.test.ts \
  src/server/routes/mu-fight-desk.ts src/server/routes/mu-fight-desk.test.ts \
  src/web/features/mu/types.ts
git commit -m "$(cat <<'EOF'
feat: attach battle strip payload on fight-desk API

EOF
)"
```

---

### Task 9: Prefs v2 `selectedBattleId`

**Files:**
- Modify: `src/web/lib/fightDeskPrefs.ts`
- Modify: `src/web/lib/fightDeskPrefs.test.ts`

**Interfaces:**
- Produces:

```ts
export const FIGHT_DESK_PREFS_VERSION = 2;
export type FightDeskPrefsV2 = {
  v: 2;
  foodId: string;
  battleBonus: number; // Custom typed fraction only
  ticks: number;
  selectedUserIds: string[];
  lastPresetId: string | null;
  expandedUserIds: string[];
  selectedBattleId: string | "custom";
};
export function defaultFightDeskPrefs(): FightDeskPrefsV2
```

- [ ] **Step 1: Write failing tests**

- `fightDeskPrefsKey` → `fightDeskPrefs:v2:${muId}`
- default `selectedBattleId: "custom"`, `battleBonus: 0`
- load v2 round-trips `selectedBattleId: "b1"`
- load v1 JSON `{ v: 1, foodId, battleBonus: 0.1, ticks, selectedUserIds, ... }` → migrated v2 with same knobs and `selectedBattleId: "custom"`
- unknown version → `null`

Remove/replace the current test that treats `v: 2` as invalid.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/web/lib/fightDeskPrefs.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement parse/migrate/save**

`parsePrefs`: if `row.v === 1` and v1 fields valid, return `{ ...v1fields, v: 2, selectedBattleId: "custom" }`. If `row.v === 2`, require `selectedBattleId` is `"custom"` or a non-empty string.

- [ ] **Step 4: Run tests**

Run: `vp test src/web/lib/fightDeskPrefs.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/web/lib/fightDeskPrefs.ts src/web/lib/fightDeskPrefs.test.ts
git commit -m "$(cat <<'EOF'
feat: persist Fight Desk selected battle id

EOF
)"
```

---

### Task 10: Battle strip UI + Fight Desk wiring

**Files:**
- Create: `src/web/features/mu/FightDeskBattleStrip.tsx`
- Create: `src/web/features/mu/FightDeskBattleStrip.test.tsx`
- Modify: `src/web/features/mu/FightDeskTab.tsx`
- Modify: `src/web/features/mu/types.ts` if the query type is not already updated

**Interfaces:**
- Consumes: `MuFightDeskBattle[]`, prefs `selectedBattleId` + `battleBonus`
- Produces: click/Custom updates prefs; parent sets `fightKnobs.battleBonus` to selected live `bonus.total` or Custom fraction

- [ ] **Step 1: Write failing UI tests** (`renderToStaticMarkup`, same as `FightDeskMemberRow.test.tsx`)

```tsx
it("renders MU damage and fire % on a live card", () => {
  const html = renderToStaticMarkup(
    <FightDeskBattleStrip
      battles={[creteBattle]}
      selectedBattleId={creteBattle.id}
      customBonus={0}
      onSelectBattle={() => {}}
      onCustomBonusChange={() => {}}
    />,
  );
  expect(html).toContain("Crete");
  expect(html).toContain("12.4");
  expect(html).toContain("+20%"); // example total from fixture
});

it("shows MU — when muDamageToDate is null", () => {
  const html = renderToStaticMarkup(
    <FightDeskBattleStrip battles={[{ ...creteBattle, muDamageToDate: null }]} ... />,
  );
  expect(html).toContain("MU —");
  expect(html).not.toContain("MU 0");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/web/features/mu/FightDeskBattleStrip.test.tsx`

Expected: FAIL

- [ ] **Step 3: Implement strip + tab**

Card chrome (dark existing tokens, not a new theme):

- Custom card: dashed empty flag boxes, shield-swords, editable fire `%` bound to `customBonus * 100` (same `numericInputValue` helper as today). Selecting Custom sets `selectedBattleId` to `"custom"`.
- Live cards: `FlagIcon` with iso or country id; shield-swords, or a fist character if `isRevolt`; order badges (MU crest text `MU` + country flag) from `kind` / sides; fire `+{Math.round(bonus.total * 100)}%`; `MU {compact}` from `muDamageToDate`.
- Compact damage: `n >= 1e6` → one-decimal `M`; `n >= 1e3` → one-decimal `K`; else `formatDisplayNumber(n, 0, { groupThousands: true })`.
- Selected live card: ring highlight + breakdown line under the strip from `bonus.parts` (`applied` as `Label +X%`, `off` as `bunker off` when id is bunker/hq/supply, skip boring offs if the list gets long — always show supply as `supply OK` or `supply −25%`, always show `off` HQ).
- Sort already done by API.

`FightDeskTab.tsx`:

- Remove the Advanced “Battle bonus %” input. Keep ticks in Advanced.
- Render `FightDeskBattleStrip` above summary cards.
- `fightKnobs.battleBonus` = selected live battle’s `bonus.total`, or `prefs.battleBonus` when Custom.
- First visit after members+battles load: if `applyInitialPreset` path already ran and `selectedBattleId` is still default `"custom"` **and** no stored v2 prefs existed, select the first `kind !== "country_order"` battle (else stay Custom). If `loadFightDeskPrefs` returned a stored v2 row, do not override `selectedBattleId`.
- If `selectedBattleId` is not `"custom"` and not in `battles[]`, behave as Custom and **keep** `prefs.battleBonus` (last applied %). When falling back from a live pick, also copy the vanished battle’s last known `bonus.total` into `battleBonus` if we still have it in memory from the previous query; if not, keep stored Custom %.

- [ ] **Step 4: Run tests + check**

Run:

```
vp test src/web/features/mu/FightDeskBattleStrip.test.tsx src/web/lib/fightDeskPrefs.test.ts
vp check
```

Expected: PASS / check clean

- [ ] **Step 5: Commit**

```bash
git add src/web/features/mu/FightDeskBattleStrip.tsx src/web/features/mu/FightDeskBattleStrip.test.tsx \
  src/web/features/mu/FightDeskTab.tsx
git commit -m "$(cat <<'EOF'
feat: Fight Desk battle strip for bonus and MU damage

EOF
)"
```

---

### Task 11: Inventory

**Files:**
- Modify: `docs/warera-api/inventory.md` battles row + consumers
- Modify: `.agents/skills/warera-api/procedures.md` if any used-here bits were missed

- [ ] **Step 1: Update inventory**

Battles row: relevance is watched MU in `muOrders` **or** watched MU `country_id` in `countryOrders` / `battle_orders`. Procedures add `battleOrder.getByBattle`; diplomacy/region/alliance/world-dev as actually called. Storage add `battle_orders`, `battle_bonus_facts`, `country_diplomacy`. Main consumers: Fight Desk (`GET /api/mu/:muId/fight-desk` strip + loot sums). Remove “future UI yet”.

Do not edit `docs/warera-api/vision.md`.

- [ ] **Step 2: Commit**

```bash
git add docs/warera-api/inventory.md .agents/skills/warera-api/procedures.md
git commit -m "$(cat <<'EOF'
docs: inventory Fight Desk battle bonus data flow

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Card strip layout B, warera-build chrome | 10 |
| Custom typed % | 9, 10 |
| MU orders first, then country orders | 8 sort, 10 |
| Current MU-country stack, yellow = Low | 1, 8 |
| Breakdown on selected fight | 10 |
| MU battle-to-date loot sum, `MU —` | 5, 8, 10 |
| No side-total / allies / peak-bonus / per-member bonus | omitted |
| Supply-line −25%, unknown if uncomputed | 1, 7 |
| Jobs own facts; no tab live-scrape | 6, 7, 8 |
| Sticky until finalize; strip = active current orders | 6, 5 list filter |
| Prefs persist selection; first visit MU-order else Custom | 9, 10 |
| Fight-desk API `battles[]` | 8 |
| Inventory | 11 |
| Typed columns / sibling tables | 4 |

Alliance numeric curve is pinned to the v0.25 patch notes in Task 1 (`+10%` plateau). If live/wiki `+20%` is confirmed, change `allianceBonusFromWorldShare` only.
