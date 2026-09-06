# Equipment Craft vs Scrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Craft vs scrap panel on Equipment overview that compares selling scraps vs crafting random/specific gear (min/median/max advantage), using warm scrap/steel prices and item-market sales.

**Architecture:** Pure domain math in `src/equipment/craft.ts`; `GET /api/equipment/craft-compare` reads price snapshots + txs + country tax (no new WarEra calls); overview UI fetches that endpoint and renders baseline strip + comparison table.

**Tech Stack:** TypeScript, Hono, Drizzle/libSQL reads, React 19, Vitest via `vp test` / `vite-plus/test`, Vite+ (`vp check`).

**Design:** [2026-09-06-equipment-craft-vs-scrap-design.md](../specs/2026-09-06-equipment-craft-vs-scrap-design.md)

## Global Constraints

- Scraps owned (opportunity = market scrap price); steel bought at market steel price
- Gear proceeds = seller excl = `money / (1 + taxRate)`
- Typical = median of sales; random typical = mean of each priced item’s median
- Advantage = `gearExcl − steelCost − scrapValue` (positive = craft beats sell-scrap)
- Craft scrap qty ≠ dismantle yields (e.g. mythic craft 1460 vs dismantle 1458)
- Same `MARKET_WINDOW_MS` as overview; no skill-band filtering
- Register `/craft-compare` **before** `/:itemCode` on the equipment router
- `countryId` required (400 if missing); unknown `tier` → 400
- Prefer `vp test path` / `vp check` for verification
- Commit after each task
- Keep UI on Equipment overview only (no new page)

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/equipment/craft.ts` | Craft costs, item codes for tier, `buildCraftCompare` |
| `src/equipment/craft.test.ts` | Unit tests for costs, enumeration, compare math |
| `src/server/routes/equipment.ts` | `GET /craft-compare` |
| `src/server/routes/equipment.test.ts` | Route tests for craft-compare |
| `src/web/features/equipment-market/types.ts` | `CraftCompareResponse` types |
| `src/web/features/equipment-market/CraftVsScrapPanel.tsx` | Tier control + baseline + table |
| `src/web/features/equipment-market/EquipmentOverviewPage.tsx` | Mount panel above tier groups |
| `.agents/skills/warera-game-mechanics/gear-economy.md` | Document craft cost table |
| `docs/warera-api/inventory.md` | Note craft-compare as consumer |

---

### Task 1: Craft domain module (costs, codes, compare)

**Files:**
- Create: `src/equipment/craft.ts`
- Create: `src/equipment/craft.test.ts`
- Modify: `.agents/skills/warera-game-mechanics/gear-economy.md`

**Interfaces:**
- Consumes: `GearTierId` from `../calculator`; `median` from `./median`; `ITEM_CODE_TIER_OVERRIDES`, `compareEquipmentItems` from `./catalog`; `ItemMarketTxRow` from `../db/item-market-tx-read`
- Produces:
  - `export type CraftCost = { scrapQty: number; steelRandom: number; steelSpecific: number }`
  - `export const CRAFT_COSTS: Record<GearTierId, CraftCost>`
  - `export function craftCostForTier(tier: GearTierId): CraftCost`
  - `export function itemCodesForTier(tier: GearTierId): string[]` — weapon + 5 armor codes, slot-sorted via `compareEquipmentItems`
  - `export type CraftStatBlock = { minExcl: number | null; medianExcl: number | null; maxExcl: number | null; minAdvantage: number | null; medianAdvantage: number | null; maxAdvantage: number | null; trades: number }`
  - `export type CraftSpecificRow = CraftStatBlock & { itemCode: string }`
  - `export type CraftCompareResult = { tier: GearTierId; scrapQty: number; steelRandom: number; steelSpecific: number; scrapPrice: number | null; steelPrice: number | null; scrapValue: number | null; steelCostRandom: number | null; steelCostSpecific: number | null; taxRate: number; itemCount: number; pricedItemCount: number; random: CraftStatBlock; specific: CraftSpecificRow[] }`
  - `export function buildCraftCompare(input: { tier: GearTierId; txs: ItemMarketTxRow[]; scrapPrice: number | null; steelPrice: number | null; taxRate: number }): CraftCompareResult`

- [ ] **Step 1: Write the failing tests**

Create `src/equipment/craft.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import type { ItemMarketTxRow } from "../db/item-market-tx-read";
import {
  buildCraftCompare,
  craftCostForTier,
  itemCodesForTier,
} from "./craft";

function tx(
  overrides: Partial<ItemMarketTxRow> & Pick<ItemMarketTxRow, "id" | "money" | "itemCode">,
): ItemMarketTxRow {
  return {
    skills: null,
    createdAt: new Date("2026-08-05T12:00:00.000Z"),
    ...overrides,
  };
}

describe("craftCostForTier", () => {
  it("returns mythic craft costs (not dismantle yields)", () => {
    expect(craftCostForTier("red")).toEqual({
      scrapQty: 1460,
      steelRandom: 32,
      steelSpecific: 64,
    });
  });

  it("returns common craft costs", () => {
    expect(craftCostForTier("gray")).toEqual({
      scrapQty: 6,
      steelRandom: 1,
      steelSpecific: 2,
    });
  });
});

describe("itemCodesForTier", () => {
  it("lists weapon then armor for mythic", () => {
    expect(itemCodesForTier("red")).toEqual([
      "jet",
      "helmet6",
      "chest6",
      "gloves6",
      "pants6",
      "boots6",
    ]);
  });

  it("lists knife and gray armor for common", () => {
    expect(itemCodesForTier("gray")[0]).toBe("knife");
    expect(itemCodesForTier("gray")).toContain("boots1");
  });
});

describe("buildCraftCompare", () => {
  const taxRate = 0.01;
  const scrapPrice = 0.2;
  const steelPrice = 1.5;

  it("computes sell-scrap baseline costs and per-item advantages", () => {
    // jet sales incl 500 and 600 → excl = money/1.01
    const result = buildCraftCompare({
      tier: "red",
      scrapPrice,
      steelPrice,
      taxRate,
      txs: [
        tx({ id: "1", itemCode: "jet", money: 500 }),
        tx({ id: "2", itemCode: "jet", money: 600 }),
        tx({ id: "3", itemCode: "helmet6", money: 400 }),
      ],
    });

    expect(result.scrapQty).toBe(1460);
    expect(result.scrapValue).toBeCloseTo(1460 * 0.2, 10);
    expect(result.steelCostRandom).toBeCloseTo(32 * 1.5, 10);
    expect(result.steelCostSpecific).toBeCloseTo(64 * 1.5, 10);
    expect(result.itemCount).toBe(6);
    expect(result.pricedItemCount).toBe(2);

    const jet = result.specific.find((r) => r.itemCode === "jet")!;
    const jetMinExcl = 500 / 1.01;
    const jetMaxExcl = 600 / 1.01;
    const jetMedExcl = (500 / 1.01 + 600 / 1.01) / 2;
    expect(jet.minExcl).toBeCloseTo(jetMinExcl, 10);
    expect(jet.maxExcl).toBeCloseTo(jetMaxExcl, 10);
    expect(jet.medianExcl).toBeCloseTo(jetMedExcl, 10);
    expect(jet.medianAdvantage).toBeCloseTo(
      jetMedExcl - 64 * 1.5 - 1460 * 0.2,
      10,
    );
    expect(jet.trades).toBe(2);

    // unpriced specific rows still present
    expect(result.specific.some((r) => r.itemCode === "boots6" && r.trades === 0)).toBe(
      true,
    );

    // sorted by median advantage desc; nulls last
    const medians = result.specific.map((r) => r.medianAdvantage);
    const defined = medians.filter((v) => v != null) as number[];
    for (let i = 1; i < defined.length; i++) {
      expect(defined[i]! <= defined[i - 1]!).toBe(true);
    }
    expect(result.specific.at(-1)!.medianAdvantage).toBeNull();
  });

  it("builds random pool from equal-weight item medians and half steel", () => {
    const result = buildCraftCompare({
      tier: "red",
      scrapPrice,
      steelPrice,
      taxRate,
      txs: [
        tx({ id: "1", itemCode: "jet", money: 505 }), // excl ~500
        tx({ id: "2", itemCode: "helmet6", money: 303 }), // excl ~300
      ],
    });

    const jetMed = 505 / 1.01;
    const helmMed = 303 / 1.01;
    const typical = (jetMed + helmMed) / 2;
    expect(result.random.medianExcl).toBeCloseTo(typical, 10);
    expect(result.random.minExcl).toBeCloseTo(Math.min(jetMed, helmMed), 10);
    expect(result.random.maxExcl).toBeCloseTo(Math.max(jetMed, helmMed), 10);
    expect(result.random.medianAdvantage).toBeCloseTo(
      typical - 32 * 1.5 - 1460 * 0.2,
      10,
    );
    expect(result.random.trades).toBe(2);
  });

  it("returns null advantages when scrap or steel price missing", () => {
    const result = buildCraftCompare({
      tier: "red",
      scrapPrice: null,
      steelPrice: 1.5,
      taxRate,
      txs: [tx({ id: "1", itemCode: "jet", money: 500 })],
    });
    expect(result.scrapValue).toBeNull();
    expect(result.specific.find((r) => r.itemCode === "jet")!.medianAdvantage).toBeNull();
    expect(result.random.medianAdvantage).toBeNull();
  });

  it("returns null random stats when no priced items", () => {
    const result = buildCraftCompare({
      tier: "red",
      scrapPrice,
      steelPrice,
      taxRate,
      txs: [],
    });
    expect(result.pricedItemCount).toBe(0);
    expect(result.random.minExcl).toBeNull();
    expect(result.random.medianExcl).toBeNull();
    expect(result.random.maxExcl).toBeNull();
    expect(result.random.trades).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/equipment/craft.test.ts`

Expected: FAIL (module `./craft` not found)

- [ ] **Step 3: Implement `src/equipment/craft.ts`**

```ts
import type { GearTierId } from "../calculator";
import type { ItemMarketTxRow } from "../db/item-market-tx-read";
import { compareEquipmentItems, ITEM_CODE_TIER_OVERRIDES } from "./catalog";
import { median } from "./median";

export type CraftCost = {
  scrapQty: number;
  steelRandom: number;
  steelSpecific: number;
};

export const CRAFT_COSTS: Record<GearTierId, CraftCost> = {
  red: { scrapQty: 1460, steelRandom: 32, steelSpecific: 64 },
  yellow: { scrapQty: 486, steelRandom: 16, steelSpecific: 32 },
  purple: { scrapQty: 162, steelRandom: 8, steelSpecific: 16 },
  blue: { scrapQty: 54, steelRandom: 4, steelSpecific: 8 },
  green: { scrapQty: 18, steelRandom: 2, steelSpecific: 4 },
  gray: { scrapQty: 6, steelRandom: 1, steelSpecific: 2 },
};

const TIER_DIGIT: Record<GearTierId, number> = {
  gray: 1,
  green: 2,
  blue: 3,
  purple: 4,
  yellow: 5,
  red: 6,
};

const ARMOR_BASES = ["helmet", "chest", "gloves", "pants", "boots"] as const;

export function craftCostForTier(tier: GearTierId): CraftCost {
  return CRAFT_COSTS[tier];
}

export function itemCodesForTier(tier: GearTierId): string[] {
  const digit = TIER_DIGIT[tier];
  const weapon =
    Object.entries(ITEM_CODE_TIER_OVERRIDES).find(([, t]) => t === tier)?.[0] ?? null;
  const codes: string[] = [];
  if (weapon) codes.push(weapon);
  for (const base of ARMOR_BASES) codes.push(`${base}${digit}`);
  return codes.sort(compareEquipmentItems);
}

export type CraftStatBlock = {
  minExcl: number | null;
  medianExcl: number | null;
  maxExcl: number | null;
  minAdvantage: number | null;
  medianAdvantage: number | null;
  maxAdvantage: number | null;
  trades: number;
};

export type CraftSpecificRow = CraftStatBlock & { itemCode: string };

export type CraftCompareResult = {
  tier: GearTierId;
  scrapQty: number;
  steelRandom: number;
  steelSpecific: number;
  scrapPrice: number | null;
  steelPrice: number | null;
  scrapValue: number | null;
  steelCostRandom: number | null;
  steelCostSpecific: number | null;
  taxRate: number;
  itemCount: number;
  pricedItemCount: number;
  random: CraftStatBlock;
  specific: CraftSpecificRow[];
};

function exclFromMoney(money: number, taxRate: number): number {
  return money / (1 + taxRate);
}

function advantage(
  gearExcl: number | null,
  steelCost: number | null,
  scrapValue: number | null,
): number | null {
  if (gearExcl == null || steelCost == null || scrapValue == null) return null;
  return gearExcl - steelCost - scrapValue;
}

function minMax(values: number[]): { min: number | null; max: number | null } {
  if (values.length === 0) return { min: null, max: null };
  let min = values[0]!;
  let max = values[0]!;
  for (let i = 1; i < values.length; i++) {
    const v = values[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

function emptyStats(trades = 0): CraftStatBlock {
  return {
    minExcl: null,
    medianExcl: null,
    maxExcl: null,
    minAdvantage: null,
    medianAdvantage: null,
    maxAdvantage: null,
    trades,
  };
}

function statsFromExcls(
  exclPrices: number[],
  steelCost: number | null,
  scrapValue: number | null,
): CraftStatBlock {
  if (exclPrices.length === 0) return emptyStats(0);
  const { min, max } = minMax(exclPrices);
  const med = median(exclPrices);
  return {
    minExcl: min,
    medianExcl: med,
    maxExcl: max,
    minAdvantage: advantage(min, steelCost, scrapValue),
    medianAdvantage: advantage(med, steelCost, scrapValue),
    maxAdvantage: advantage(max, steelCost, scrapValue),
    trades: exclPrices.length,
  };
}

export function buildCraftCompare(input: {
  tier: GearTierId;
  txs: ItemMarketTxRow[];
  scrapPrice: number | null;
  steelPrice: number | null;
  taxRate: number;
}): CraftCompareResult {
  const { tier, txs, scrapPrice, steelPrice, taxRate } = input;
  const cost = craftCostForTier(tier);
  const codes = itemCodesForTier(tier);
  const scrapValue =
    scrapPrice != null && Number.isFinite(scrapPrice)
      ? cost.scrapQty * scrapPrice
      : null;
  const steelCostRandom =
    steelPrice != null && Number.isFinite(steelPrice)
      ? cost.steelRandom * steelPrice
      : null;
  const steelCostSpecific =
    steelPrice != null && Number.isFinite(steelPrice)
      ? cost.steelSpecific * steelPrice
      : null;

  const byCode = new Map<string, number[]>();
  for (const code of codes) byCode.set(code, []);
  for (const row of txs) {
    const list = byCode.get(row.itemCode);
    if (!list) continue;
    list.push(exclFromMoney(row.money, taxRate));
  }

  const specific: CraftSpecificRow[] = codes.map((itemCode) => {
    const exclPrices = byCode.get(itemCode) ?? [];
    return {
      itemCode,
      ...statsFromExcls(exclPrices, steelCostSpecific, scrapValue),
    };
  });

  specific.sort((a, b) => {
    if (a.medianAdvantage == null && b.medianAdvantage == null) {
      return compareEquipmentItems(a.itemCode, b.itemCode);
    }
    if (a.medianAdvantage == null) return 1;
    if (b.medianAdvantage == null) return -1;
    if (b.medianAdvantage !== a.medianAdvantage) {
      return b.medianAdvantage - a.medianAdvantage;
    }
    return compareEquipmentItems(a.itemCode, b.itemCode);
  });

  const priced = specific.filter((r) => r.trades > 0);
  const allExcls: number[] = [];
  const medians: number[] = [];
  let randomTrades = 0;
  for (const row of priced) {
    const exclPrices = byCode.get(row.itemCode) ?? [];
    allExcls.push(...exclPrices);
    if (row.medianExcl != null) medians.push(row.medianExcl);
    randomTrades += row.trades;
  }

  let random: CraftStatBlock;
  if (priced.length === 0) {
    random = emptyStats(0);
  } else {
    const { min, max } = minMax(allExcls);
    const typical =
      medians.length === 0
        ? null
        : medians.reduce((s, v) => s + v, 0) / medians.length;
    random = {
      minExcl: min,
      medianExcl: typical,
      maxExcl: max,
      minAdvantage: advantage(min, steelCostRandom, scrapValue),
      medianAdvantage: advantage(typical, steelCostRandom, scrapValue),
      maxAdvantage: advantage(max, steelCostRandom, scrapValue),
      trades: randomTrades,
    };
  }

  return {
    tier,
    scrapQty: cost.scrapQty,
    steelRandom: cost.steelRandom,
    steelSpecific: cost.steelSpecific,
    scrapPrice,
    steelPrice,
    scrapValue,
    steelCostRandom,
    steelCostSpecific,
    taxRate,
    itemCount: codes.length,
    pricedItemCount: priced.length,
    random,
    specific,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/equipment/craft.test.ts`

Expected: PASS

- [ ] **Step 5: Document craft costs in gear-economy.md**

After the dismantle scrap yields section in `.agents/skills/warera-game-mechanics/gear-economy.md`, add:

```md
## Craft costs (factory craft)

Craft **consumes** scraps + steel. Scrap qty is close to but not always identical to dismantle yield (mythic craft 1460 vs dismantle 1458). Random craft uses **half** the steel of a specific item; scrap qty is the same.

| Tier | Scrap | Steel (random / specific) |
| --- | --- | --- |
| Mythic (red) | 1460 | 32 / 64 |
| Legendary (yellow) | 486 | 16 / 32 |
| Epic (purple) | 162 | 8 / 16 |
| Rare (blue) | 54 | 4 / 8 |
| Uncommon (green) | 18 | 2 / 4 |
| Common (gray) | 6 | 1 / 2 |

App: `src/equipment/craft.ts` (`CRAFT_COSTS`, craft-vs-scrap compare).
```

Also add a row in the skill’s “Source of truth” / related table if one lists gear calc paths: craft compare → `src/equipment/craft.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/equipment/craft.ts src/equipment/craft.test.ts .agents/skills/warera-game-mechanics/gear-economy.md
git commit -m "$(cat <<'EOF'
feat(equipment): add craft vs scrap domain math

EOF
)"
```

---

### Task 2: `GET /api/equipment/craft-compare` route

**Files:**
- Modify: `src/server/routes/equipment.ts`
- Modify: `src/server/routes/equipment.test.ts`
- Modify: `docs/warera-api/inventory.md`

**Interfaces:**
- Consumes: `buildCraftCompare`, `CRAFT_COSTS` / tier validation via `GearTierId`; `listItemMarketTxSince`; `getLatestItemMarketPrice` for `scraps` and `steel`; `MARKET_WINDOW_MS`; `countries` tax
- Produces: JSON body = `{ windowMs, scrapedAt, steelFetchedAt, ...CraftCompareResult }` (include `windowMs`; optional ISO timestamps for scrap/steel fetches if available from price rows)

Valid tiers: `gray|green|blue|purple|yellow|red`.

- [ ] **Step 1: Write failing route tests**

Append to `src/server/routes/equipment.test.ts` (reuse `createMemoryDb`, `seedCountry`, `appFor`, `makeTx`). Add helper:

```ts
async function seedSteel(db: Db, marketPrice: number, recordedAt = new Date()): Promise<void> {
  const pollId = await insertPricePoll(db, {
    recordedAt,
    status: "success",
    itemCount: 1,
  });
  await insertPriceSnapshots(db, pollId, [
    {
      itemCode: "steel",
      marketPrice,
      buyMin: null,
      buyMax: null,
      buyAvg: null,
      sellMin: null,
      sellMax: null,
      sellAvg: null,
    },
  ]);
}
```

Add describe block:

```ts
describe("GET /craft-compare", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createMemoryDb();
  });

  it("returns craft compare for a tier", async () => {
    await seedCountry(db, { id: "sweden", name: "Sweden", taxRate: 0.01 });
    await seedScrap(db, 0.2);
    await seedSteel(db, 1.5);
    await insertItemMarketTransactionsIgnoreConflicts(db, [
      makeTx({
        id: "j1",
        itemCode: "jet",
        money: 500,
        createdAt: new Date(),
      }),
    ]);

    const res = await appFor(db).request(
      "http://localhost/craft-compare?tier=red&countryId=sweden",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tier).toBe("red");
    expect(body.windowMs).toBe(MARKET_WINDOW_MS);
    expect(body.scrapQty).toBe(1460);
    expect(body.steelRandom).toBe(32);
    expect(body.steelSpecific).toBe(64);
    expect(body.taxRate).toBe(0.01);
    expect(body.specific.some((r: { itemCode: string }) => r.itemCode === "jet")).toBe(
      true,
    );
    expect(body.random).toBeTruthy();
  });

  it("returns 400 when tier is missing or unknown", async () => {
    await seedCountry(db, { id: "sweden", name: "Sweden", taxRate: 0.01 });
    const missing = await appFor(db).request(
      "http://localhost/craft-compare?countryId=sweden",
    );
    expect(missing.status).toBe(400);
    const bad = await appFor(db).request(
      "http://localhost/craft-compare?tier=orange&countryId=sweden",
    );
    expect(bad.status).toBe(400);
  });

  it("returns 400 when countryId is missing or unknown", async () => {
    const missing = await appFor(db).request("http://localhost/craft-compare?tier=red");
    expect(missing.status).toBe(400);
    const unknown = await appFor(db).request(
      "http://localhost/craft-compare?tier=red&countryId=nope",
    );
    expect(unknown.status).toBe(400);
  });

  it("returns null cost fields when scrap or steel price missing", async () => {
    await seedCountry(db, { id: "sweden", name: "Sweden", taxRate: 0.01 });
    await seedScrap(db, 0.2);
    // no steel
    const res = await appFor(db).request(
      "http://localhost/craft-compare?tier=red&countryId=sweden",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.steelPrice).toBeNull();
    expect(body.steelCostRandom).toBeNull();
    expect(body.random.medianAdvantage).toBeNull();
  });
});
```

- [ ] **Step 2: Run route tests to verify failure**

Run: `vp test src/server/routes/equipment.test.ts`

Expected: FAIL on `GET /craft-compare` (404 or similar — route missing)

- [ ] **Step 3: Implement the route**

In `src/server/routes/equipment.ts`, import `buildCraftCompare` and a tier guard. **Insert `/craft-compare` after `/overview` and before `/:itemCode`:**

```ts
const GEAR_TIERS = new Set(["gray", "green", "blue", "purple", "yellow", "red"]);

app.get("/craft-compare", async (c) => {
  const tierRaw = c.req.query("tier")?.trim() ?? "";
  const countryId = c.req.query("countryId")?.trim() ?? "";
  if (!GEAR_TIERS.has(tierRaw)) {
    throw new HttpError(400, "bad_request", "tier must be a gear tier id");
  }
  if (!countryId) {
    throw new HttpError(400, "bad_request", "countryId is required");
  }
  const tier = tierRaw as import("../../calculator").GearTierId;

  const rows = await db
    .select({ taxRate: countries.taxRate })
    .from(countries)
    .where(eq(countries.id, countryId))
    .limit(1);
  if (!rows[0]) {
    throw new HttpError(400, "bad_request", "unknown countryId");
  }
  const taxRate = rows[0].taxRate;

  const now = Date.now();
  const since = new Date(now - MARKET_WINDOW_MS);
  const [txs, scrap, steel] = await Promise.all([
    listItemMarketTxSince(db, since),
    getLatestItemMarketPrice(db, "scraps"),
    getLatestItemMarketPrice(db, "steel"),
  ]);

  const compare = buildCraftCompare({
    tier,
    txs,
    scrapPrice: scrap?.price ?? null,
    steelPrice: steel?.price ?? null,
    taxRate,
  });

  return c.json({
    windowMs: MARKET_WINDOW_MS,
    scrapedAt: scrap?.fetchedAt?.toISOString() ?? null,
    steelFetchedAt: steel?.fetchedAt?.toISOString() ?? null,
    ...compare,
  });
});
```

Use a proper `GearTierId` import at top of file instead of inline import.

- [ ] **Step 4: Run route tests**

Run: `vp test src/server/routes/equipment.test.ts`

Expected: PASS

- [ ] **Step 5: Update inventory.md**

In `docs/warera-api/inventory.md`:

1. Bump **Last reviewed** to `2026-09-06`
2. In Global **Market prices** Main consumers, ensure Equipment / craft-compare is covered (add “Equipment craft-compare” if only Market/Calculator listed)
3. In **Item-market transactions** Main consumers, change to: `Equipment Market (/api/equipment overview, detail, craft-compare)`

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/equipment.ts src/server/routes/equipment.test.ts docs/warera-api/inventory.md
git commit -m "$(cat <<'EOF'
feat(equipment): add craft-compare API endpoint

EOF
)"
```

---

### Task 3: Craft vs scrap UI on Equipment overview

**Files:**
- Modify: `src/web/features/equipment-market/types.ts`
- Create: `src/web/features/equipment-market/CraftVsScrapPanel.tsx`
- Modify: `src/web/features/equipment-market/EquipmentOverviewPage.tsx`

**Interfaces:**
- Consumes: `GET /api/equipment/craft-compare?tier=&countryId=`; existing `CountrySelect`, `api`, `GoldIcon`, `formatDisplayNumber`, `EQUIPMENT_TIER_DISPLAY_ORDER`, `equipmentTierShortLabel`, `formatEquipmentItem`
- Produces: `CraftVsScrapPanel` props `{ countryId: string; disabled?: boolean }` — fetches when `countryId` and selected tier are set

- [ ] **Step 1: Add response types**

Append to `src/web/features/equipment-market/types.ts`:

```ts
export type CraftStatBlock = {
  minExcl: number | null;
  medianExcl: number | null;
  maxExcl: number | null;
  minAdvantage: number | null;
  medianAdvantage: number | null;
  maxAdvantage: number | null;
  trades: number;
};

export type CraftSpecificRow = CraftStatBlock & { itemCode: string };

export type CraftCompareResponse = {
  windowMs: number;
  scrapedAt: string | null;
  steelFetchedAt: string | null;
  tier: GearTierId;
  scrapQty: number;
  steelRandom: number;
  steelSpecific: number;
  scrapPrice: number | null;
  steelPrice: number | null;
  scrapValue: number | null;
  steelCostRandom: number | null;
  steelCostSpecific: number | null;
  taxRate: number;
  itemCount: number;
  pricedItemCount: number;
  random: CraftStatBlock;
  specific: CraftSpecificRow[];
};
```

- [ ] **Step 2: Implement `CraftVsScrapPanel.tsx`**

Create the panel with:

- Local state: `tier` default `"red"`, `data`, `loading`, `error`
- `useEffect` fetching `/api/equipment/craft-compare?tier=${tier}&countryId=${countryId}` when `countryId` is non-empty; abort/cancel on change
- Header: **Craft vs scrap** + short subtitle (“Sell scraps vs craft (steel bought)”)
- Controls: native `<select>` or button strip for tiers using `EQUIPMENT_TIER_DISPLAY_ORDER` + short labels (Mythic…Basic). Country stays on the parent page header — do **not** duplicate country select here; parent passes `countryId`
- Baseline strip (3 cells): Sell scrap (`scrapValue`), Unit steel (`steelPrice`), Craft steel (`steelCostRandom` / `steelCostSpecific`)
- Table:

| Path | Min Δ | Med Δ | Max Δ | Trades |
| Sell scrap | 0 | 0 | 0 | — |
| Random | … | … | … | random.trades |
| each specific (formatted name + link to `/equipment/$itemCode`) | … | … | … | trades |

- Format Δ with `formatDisplayNumber`; green text class when `> 0`, destructive/red when `< 0`, muted for `—` / null
- If `pricedItemCount === 0`, show muted note under table: “No sales in window for this tier.”
- If `!countryId`, show amber/muted: select a country above (parent already has country control)
- Match existing equipment page typography (`text-[0.75em] uppercase` labels, mono numbers, `GoldIcon` on gold amounts)

Skeleton structure:

```tsx
export function CraftVsScrapPanel({
  countryId,
  disabled,
}: {
  countryId: string;
  disabled?: boolean;
}) {
  // tier state default "red"
  // fetch craft-compare
  // render section with baseline + table
}
```

Use `Link` from `@tanstack/react-router` for item links like existing cards (`to: "/equipment/$itemCode"`).

- [ ] **Step 3: Mount on overview**

In `EquipmentOverviewPage.tsx`, after the header/error/loading block and **before** the tier `grouped.map` sections, render:

```tsx
{countryId ? (
  <CraftVsScrapPanel countryId={countryId} disabled={loading} />
) : null}
```

Keep country select in the page header (already present). Panel should appear even when overview has zero item cards (craft compare can still run).

Place it with `className="mt-4 mb-2"` (or similar) so it sits above tier groups.

- [ ] **Step 4: Manual / typecheck**

Run: `vp check`

Expected: PASS (or fix any type errors in panel/types)

Optionally spot-check: `vp run dev` → Equipment → pick country + Mythic → table shows sell/random/specific rows.

- [ ] **Step 5: Commit**

```bash
git add src/web/features/equipment-market/types.ts \
  src/web/features/equipment-market/CraftVsScrapPanel.tsx \
  src/web/features/equipment-market/EquipmentOverviewPage.tsx
git commit -m "$(cat <<'EOF'
feat(equipment): show craft vs scrap panel on overview

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Craft cost table (incl. mythic 1460) | Task 1 |
| Opportunity scrap + buy steel | Task 1 formulas + Task 3 copy |
| Seller excl / median / min-max | Task 1 |
| Random equal-weight + half steel | Task 1 |
| Ranked specifics + nulls last | Task 1 |
| API craft-compare + country required | Task 2 |
| UI top of overview, layout A | Task 3 |
| gear-economy.md craft section | Task 1 |
| inventory.md consumer note | Task 2 |
| No skill bands / no new WarEra fetch | Tasks 1–2 |
| Tests unit + route | Tasks 1–2 |

No placeholders left. Types aligned: `CraftCompareResult` / `CraftCompareResponse` fields match.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-06-equipment-craft-vs-scrap.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
**2. Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
