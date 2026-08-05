# Equipment Market Pricing UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an Equipment Market overview + detail UI that shows median sale prices, scrap floors, and country-tax seller math for gear/weapons, with per-skill target ±band filters and last-used stats memory.

**Architecture:** Pure helpers in `src/equipment/` aggregate `item_market_transactions` (median, skill bands, tier catalog). Hono `GET /api/equipment/overview` and `GET /api/equipment/:itemCode` read DB + scraps + optional country tax. Web mirrors Market (`/equipment` + `/equipment/$itemCode`): `api()` fetch, localStorage for Equipment country and per-item stats, TanStack Charts for trend + ladder. Reuse `calculateProfit` / `scrapAmountForTier`; no new WarEra jobs.

**Tech Stack:** TypeScript, Hono, Drizzle/libSQL, TanStack Router, `@tanstack/charts` + `@tanstack/react-charts`, Vitest via `vp test`, Vite+ (`vp check`).

**Design:** [2026-08-05-equipment-market-pricing-design.md](../specs/2026-08-05-equipment-market-pricing-design.md)

## Global Constraints

- Browser talks only to Hono; no live WarEra offers
- Primary market metric = **median** of `money` (tax incl); do not lead with min
- Price triad: market incl · seller excl · scrap floor
- Scrap floor = `scrapAmountForTier(tier) * scrapPrice`
- Stat filter = AND of per-skill `[target − band, target + band]`
- First visit: lowest observed skills; then last-used via `loadStats(itemCode)`
- Equipment country picker is **independent** of Calculator (own localStorage keys)
- Window for current market = **24h**; trend chart may look back up to **7d** of stored txs
- Attractive list margin constant = **0.05** (5% over break-even incl)
- Skill bands query: `skills` = URL-encoded JSON array `[{key,target,band},…]`
- Tier from itemCode: trailing digit `1…6` → gray…red; explicit override map for codes without digit; unknown → `null` (Unknown group, no scrap floor)
- No TanStack Query required (follow Market `api()` + state); Calculator stays shipped
- Prefer `vp test path` / `vp check` for verification
- Commit after each task

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/equipment/median.ts` | Median of numbers |
| `src/equipment/skills.ts` | Parse skills JSON → numbers; band match; lowest observed |
| `src/equipment/catalog.ts` | `itemCode` → `GearTierId \| null`; display label |
| `src/equipment/recommend.ts` | Break-even incl + attractive list from scrap + tax |
| `src/equipment/windows.ts` | `24h` window ms; trend lookback 7d |
| `src/equipment/overview.ts` | Build overview rows from txs + scrap price |
| `src/equipment/detail.ts` | Build detail payload (triad, daily series, ladder) |
| `src/equipment/*.test.ts` | Unit tests |
| `src/db/item-market-tx-read.ts` | Select txs by time (± optional itemCode) |
| `src/db/item-market-tx-read.test.ts` | Read window tests |
| `src/server/routes/equipment.ts` | `equipmentRoutes` overview + `:itemCode` |
| `src/server/routes/equipment.test.ts` | API tests with fixture DB |
| `src/server/app.ts` | Mount `/api/equipment` |
| `src/web/lib/equipmentPrefs.ts` | `equipmentPrefs:v1` countryId |
| `src/web/lib/equipmentStats.ts` | `equipmentStats:v1:<itemCode>` + `loadStats` |
| `src/web/lib/equipmentPrefs.test.ts` / `equipmentStats.test.ts` | Persistence tests (jsdom/localStorage mock if needed) |
| `src/web/features/equipment-market/*` | Overview, detail, charts, types |
| `src/web/routes/equipment.tsx` | Overview route |
| `src/web/routes/equipment_.$itemCode.tsx` | Detail route |
| `src/web/layout/Shell.tsx` | Nav tab `Equipment` |
| Spec status | Mark design **Approved for implementation** |

---

### Task 1: Median + skill band helpers

**Files:**
- Create: `src/equipment/median.ts`
- Create: `src/equipment/median.test.ts`
- Create: `src/equipment/skills.ts`
- Create: `src/equipment/skills.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `export function median(values: number[]): number | null`
  - `export type SkillNumbers = Record<string, number>`
  - `export function parseSkillNumbers(skills: Record<string, unknown> | null | undefined): SkillNumbers | null`
  - `export type SkillBand = { key: string; target: number; band: number }`
  - `export function matchesSkillBands(skills: SkillNumbers, bands: SkillBand[]): boolean`
  - `export function lowestObservedSkills(rows: SkillNumbers[]): SkillNumbers | null`

- [ ] **Step 1: Write failing tests**

`src/equipment/median.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { median } from "./median";

describe("median", () => {
  it("returns null for empty", () => {
    expect(median([])).toBeNull();
  });

  it("handles odd and even lengths", () => {
    expect(median([3])).toBe(3);
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("does not mutate input", () => {
    const v = [3, 1];
    median(v);
    expect(v).toEqual([3, 1]);
  });
});
```

`src/equipment/skills.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import {
  lowestObservedSkills,
  matchesSkillBands,
  parseSkillNumbers,
} from "./skills";

describe("parseSkillNumbers", () => {
  it("keeps finite numbers only", () => {
    expect(parseSkillNumbers({ armor: 22, junk: "x", n: NaN })).toEqual({ armor: 22 });
    expect(parseSkillNumbers(null)).toBeNull();
    expect(parseSkillNumbers({})).toBeNull();
  });
});

describe("matchesSkillBands", () => {
  it("ANDs inclusive bands", () => {
    const skills = { attack: 89, criticalChance: 13 };
    expect(
      matchesSkillBands(skills, [
        { key: "attack", target: 89, band: 1 },
        { key: "criticalChance", target: 13, band: 1 },
      ]),
    ).toBe(true);
    expect(
      matchesSkillBands(skills, [
        { key: "attack", target: 89, band: 0 },
        { key: "criticalChance", target: 12, band: 0 },
      ]),
    ).toBe(false);
  });

  it("fails when a required skill key is missing", () => {
    expect(
      matchesSkillBands({ attack: 89 }, [{ key: "criticalChance", target: 13, band: 1 }]),
    ).toBe(false);
  });
});

describe("lowestObservedSkills", () => {
  it("takes per-key minimum across rows", () => {
    expect(
      lowestObservedSkills([
        { attack: 90, criticalChance: 14 },
        { attack: 85, criticalChance: 16 },
      ]),
    ).toEqual({ attack: 85, criticalChance: 14 });
  });

  it("returns null when empty", () => {
    expect(lowestObservedSkills([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
vp test src/equipment/median.test.ts src/equipment/skills.test.ts
```

Expected: FAIL (modules missing)

- [ ] **Step 3: Implement**

`src/equipment/median.ts`:

```ts
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}
```

`src/equipment/skills.ts`:

```ts
export type SkillNumbers = Record<string, number>;

export function parseSkillNumbers(
  skills: Record<string, unknown> | null | undefined,
): SkillNumbers | null {
  if (!skills) return null;
  const out: SkillNumbers = {};
  for (const [k, v] of Object.entries(skills)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export type SkillBand = { key: string; target: number; band: number };

export function matchesSkillBands(skills: SkillNumbers, bands: SkillBand[]): boolean {
  if (bands.length === 0) return true;
  for (const b of bands) {
    const v = skills[b.key];
    if (v === undefined) return false;
    const band = Math.max(0, b.band);
    if (v < b.target - band || v > b.target + band) return false;
  }
  return true;
}

export function lowestObservedSkills(rows: SkillNumbers[]): SkillNumbers | null {
  if (rows.length === 0) return null;
  const out: SkillNumbers = {};
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      const cur = out[k];
      out[k] = cur === undefined ? v : Math.min(cur, v);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
vp test src/equipment/median.test.ts src/equipment/skills.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/equipment/median.ts src/equipment/median.test.ts src/equipment/skills.ts src/equipment/skills.test.ts
git commit -m "$(cat <<'EOF'
feat(equipment): add median and skill-band helpers

EOF
)"
```

---

### Task 2: Catalog (tier from itemCode) + recommend listing

**Files:**
- Create: `src/equipment/catalog.ts`
- Create: `src/equipment/catalog.test.ts`
- Create: `src/equipment/recommend.ts`
- Create: `src/equipment/recommend.test.ts`
- Create: `src/equipment/windows.ts`

**Interfaces:**
- Consumes: `GearTierId`, `scrapAmountForTier`, `calculateProfit` from `src/calculator`
- Produces:
  - `export function tierFromItemCode(itemCode: string): GearTierId | null`
  - `export function formatEquipmentItem(itemCode: string): string` (reuse market `formatItem` logic or re-export)
  - `export const ATTRACTIVE_MARGIN = 0.05`
  - `export type RecommendListing = { breakEvenIncl: number; attractiveIncl: number; scrapFloor: number }`
  - `export function recommendListing(input: { tier: GearTierId; scrapPrice: number; taxRate: number }): RecommendListing`
  - `export const MARKET_WINDOW_MS = 24 * 60 * 60 * 1000`
  - `export const TREND_LOOKBACK_MS = 7 * MARKET_WINDOW_MS`

- [ ] **Step 1: Write failing tests**

`src/equipment/catalog.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { tierFromItemCode } from "./catalog";

describe("tierFromItemCode", () => {
  it("maps trailing 1–6 to gray…red", () => {
    expect(tierFromItemCode("chest1")).toBe("gray");
    expect(tierFromItemCode("helmet4")).toBe("purple");
    expect(tierFromItemCode("boots6")).toBe("red");
  });

  it("uses overrides for known weapon codes", () => {
    // sniper has no digit; override table must include it once confirmed — start as null unless override set
    expect(tierFromItemCode("sniper")).toBeNull();
  });

  it("returns null for unknown / bad suffix", () => {
    expect(tierFromItemCode("chest0")).toBeNull();
    expect(tierFromItemCode("chest7")).toBeNull();
    expect(tierFromItemCode("")).toBeNull();
  });
});
```

`src/equipment/recommend.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { ATTRACTIVE_MARGIN, recommendListing } from "./recommend";

describe("recommendListing", () => {
  it("computes scrap floor and break-even incl", () => {
    // purple = 162 scraps; 162 * 0.215 = 34.83; break-even incl = 34.83 * 1.01
    const r = recommendListing({ tier: "purple", scrapPrice: 0.215, taxRate: 0.01 });
    expect(r.scrapFloor).toBeCloseTo(34.83, 5);
    expect(r.breakEvenIncl).toBeCloseTo(34.83 * 1.01, 5);
    expect(r.attractiveIncl).toBeCloseTo(r.breakEvenIncl * (1 + ATTRACTIVE_MARGIN), 5);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
vp test src/equipment/catalog.test.ts src/equipment/recommend.test.ts
```

- [ ] **Step 3: Implement**

`src/equipment/windows.ts`:

```ts
export const MARKET_WINDOW_MS = 24 * 60 * 60 * 1000;
export const TREND_LOOKBACK_MS = 7 * MARKET_WINDOW_MS;
```

`src/equipment/catalog.ts`:

```ts
import type { GearTierId } from "../calculator";

const SUFFIX_TIERS: GearTierId[] = ["gray", "green", "blue", "purple", "yellow", "red"];

/** Explicit tiers for itemCodes without a 1–6 suffix. Extend as codes are confirmed. */
export const ITEM_CODE_TIER_OVERRIDES: Record<string, GearTierId> = {
  // e.g. sniper: "yellow" once confirmed from live data / wiki
};

export function tierFromItemCode(itemCode: string): GearTierId | null {
  const code = itemCode.trim();
  if (!code) return null;
  const overridden = ITEM_CODE_TIER_OVERRIDES[code];
  if (overridden) return overridden;
  const m = /(\d)$/.exec(code);
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 1 || n > 6) return null;
  return SUFFIX_TIERS[n - 1]!;
}

export function formatEquipmentItem(itemCode: string): string {
  return itemCode.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}
```

`src/equipment/recommend.ts`:

```ts
import { calculateProfit, scrapAmountForTier, type GearTierId } from "../calculator";

export const ATTRACTIVE_MARGIN = 0.05;

export type RecommendListing = {
  scrapFloor: number;
  breakEvenIncl: number;
  attractiveIncl: number;
};

export function recommendListing(input: {
  tier: GearTierId;
  scrapPrice: number;
  taxRate: number;
}): RecommendListing {
  const scrapAmount = scrapAmountForTier(input.tier);
  const scrapFloor = input.scrapPrice * scrapAmount;
  // break-even: excl == scrapFloor ⇒ incl = scrapFloor * (1 + tax)
  const breakEvenIncl = scrapFloor * (1 + input.taxRate);
  // sanity: calculateProfit at break-even should be ~0
  void calculateProfit({
    scrapPrice: input.scrapPrice,
    scrapAmount,
    inclPrice: breakEvenIncl,
    taxRate: input.taxRate,
  });
  return {
    scrapFloor,
    breakEvenIncl,
    attractiveIncl: breakEvenIncl * (1 + ATTRACTIVE_MARGIN),
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
vp test src/equipment/catalog.test.ts src/equipment/recommend.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/equipment/catalog.ts src/equipment/catalog.test.ts src/equipment/recommend.ts src/equipment/recommend.test.ts src/equipment/windows.ts
git commit -m "$(cat <<'EOF'
feat(equipment): map item tiers and recommend list prices

EOF
)"
```

---

### Task 3: DB read helpers for item-market txs

**Files:**
- Create: `src/db/item-market-tx-read.ts`
- Create: `src/db/item-market-tx-read.test.ts`

**Interfaces:**
- Consumes: `Db`, `itemMarketTransactions` from schema
- Produces:
  - `export type ItemMarketTxRow = { id: string; money: number; itemCode: string; skills: Record<string, unknown> | null; createdAt: Date }`
  - `export async function listItemMarketTxSince(db: Db, since: Date, itemCode?: string): Promise<ItemMarketTxRow[]>`

- [ ] **Step 1: Write failing test**

`src/db/item-market-tx-read.test.ts` — copy the local `createDb()` SQL bootstrap and `makeTx` helper from `src/db/item-market-transactions.test.ts` (same CREATE TABLE + indexes), then:

```ts
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { ItemMarketTransaction } from "../warera/transactions";
import type { Db } from "./client";
import { insertItemMarketTransactionsIgnoreConflicts } from "./item-market-transactions";
import { listItemMarketTxSince } from "./item-market-tx-read";

// paste createDb() + makeTx() verbatim from item-market-transactions.test.ts

describe("listItemMarketTxSince", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createDb();
  });

  it("filters by since and optional itemCode", async () => {
    const t0 = new Date("2026-08-05T12:00:00.000Z");
    const t1 = new Date("2026-08-05T18:00:00.000Z");
    await insertItemMarketTransactionsIgnoreConflicts(db, [
      makeTx({ id: "a", itemCode: "chest4", money: 40, createdAt: t0 }),
      makeTx({ id: "b", itemCode: "chest4", money: 50, createdAt: t1 }),
      makeTx({ id: "c", itemCode: "helmet4", money: 30, createdAt: t1 }),
    ]);
    const since = new Date("2026-08-05T15:00:00.000Z");
    const all = await listItemMarketTxSince(db, since);
    expect(all.map((r) => r.id).sort()).toEqual(["b", "c"]);
    const chest = await listItemMarketTxSince(db, since, "chest4");
    expect(chest.map((r) => r.id)).toEqual(["b"]);
  });
});
```

**Note:** Duplicating the inline `CREATE TABLE` in the new test file is intentional (same pattern as sibling DB tests); do not share a half-migrated helper.

- [ ] **Step 2: Run test — expect FAIL**

```bash
vp test src/db/item-market-tx-read.test.ts
```

- [ ] **Step 3: Implement**

```ts
import { and, eq, gte } from "drizzle-orm";
import type { Db } from "./client";
import { itemMarketTransactions } from "./schema";

export type ItemMarketTxRow = {
  id: string;
  money: number;
  itemCode: string;
  skills: Record<string, unknown> | null;
  createdAt: Date;
};

export async function listItemMarketTxSince(
  db: Db,
  since: Date,
  itemCode?: string,
): Promise<ItemMarketTxRow[]> {
  const cond = itemCode
    ? and(gte(itemMarketTransactions.createdAt, since), eq(itemMarketTransactions.itemCode, itemCode))
    : gte(itemMarketTransactions.createdAt, since);
  const rows = await db
    .select({
      id: itemMarketTransactions.id,
      money: itemMarketTransactions.money,
      itemCode: itemMarketTransactions.itemCode,
      skills: itemMarketTransactions.skills,
      createdAt: itemMarketTransactions.createdAt,
    })
    .from(itemMarketTransactions)
    .where(cond);
  return rows.map((r) => ({
    ...r,
    skills: r.skills ?? null,
  }));
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
vp test src/db/item-market-tx-read.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/db/item-market-tx-read.ts src/db/item-market-tx-read.test.ts
git commit -m "$(cat <<'EOF'
feat(db): read item-market transactions by time window

EOF
)"
```

---

### Task 4: Overview aggregation + `GET /api/equipment/overview`

**Files:**
- Create: `src/equipment/overview.ts`
- Create: `src/equipment/overview.test.ts`
- Create: `src/server/routes/equipment.ts`
- Create: `src/server/routes/equipment.test.ts`
- Modify: `src/server/app.ts` (mount route)

**Interfaces:**
- Consumes: `listItemMarketTxSince`, `median`, `parseSkillNumbers`, `tierFromItemCode`, `scrapAmountForTier`, `getLatestItemMarketPrice` / `resolveScrapPrice`, `MARKET_WINDOW_MS`
- Produces:
  - `export type OverviewItemRow = { itemCode: string; tier: GearTierId | null; marketMedian: number | null; scrapFloor: number | null; spread: number | null; trades: number }`
  - `export type OverviewResult = { windowMs: number; scrapPrice: number | null; scrapedAt: string | null; items: OverviewItemRow[] }`
  - `export function buildEquipmentOverview(txs, scrapPrice): OverviewResult["items"]` (pure)
  - `GET /api/equipment/overview` → `{ windowMs, scrapPrice, scrapedAt, items }`

- [ ] **Step 1: Write failing pure + API tests**

`src/equipment/overview.test.ts` — group two `chest4` sales → median; scrap floor for purple; spread = median − floor; zero-trade codes are not invented (only codes present in txs).

`src/server/routes/equipment.test.ts` — follow `prices.test.ts` / `scraps.test.ts`: in-memory app with `equipmentRoutes`, seed txs + scrap snapshot, `GET /overview`, assert JSON shape.

- [ ] **Step 2: Run — expect FAIL**

```bash
vp test src/equipment/overview.test.ts src/server/routes/equipment.test.ts
```

- [ ] **Step 3: Implement pure `buildEquipmentOverview` then route**

Overview route:

```ts
app.get("/overview", async (c) => {
  const now = Date.now();
  const since = new Date(now - MARKET_WINDOW_MS);
  const txs = await listItemMarketTxSince(db, since);
  const scrap = await getLatestItemMarketPrice(db, "scraps"); // or resolveScrapPrice without force
  const items = buildEquipmentOverview(txs, scrap?.marketPrice ?? null);
  return c.json({
    windowMs: MARKET_WINDOW_MS,
    scrapPrice: scrap?.marketPrice ?? null,
    scrapedAt: scrap?.polledAt?.toISOString() ?? null,
    items,
  });
});
```

`buildEquipmentOverview`: group by `itemCode`; median of `money`; `tier = tierFromItemCode`; `scrapFloor = tier && scrapPrice != null ? scrapAmountForTier(tier) * scrapPrice : null`; `spread = market != null && floor != null ? market - floor : null`.

Mount in `createApp`:

```ts
app.route("/api/equipment", equipmentRoutes({ db: deps.db, warera: deps.warera, logger: deps.logger }));
```

- [ ] **Step 4: Run — expect PASS**

```bash
vp test src/equipment/overview.test.ts src/server/routes/equipment.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/equipment/overview.ts src/equipment/overview.test.ts src/server/routes/equipment.ts src/server/routes/equipment.test.ts src/server/app.ts
git commit -m "$(cat <<'EOF'
feat(api): add equipment market overview endpoint

EOF
)"
```

---

### Task 5: Detail aggregation + `GET /api/equipment/:itemCode`

**Files:**
- Create: `src/equipment/detail.ts`
- Create: `src/equipment/detail.test.ts`
- Modify: `src/server/routes/equipment.ts`
- Modify: `src/server/routes/equipment.test.ts`

**Interfaces:**
- Consumes: skills helpers, median, recommendListing, tierFromItemCode, TREND_LOOKBACK_MS, MARKET_WINDOW_MS, countries tax
- Produces detail payload:

```ts
export type EquipmentDetail = {
  itemCode: string;
  tier: GearTierId | null;
  scrapPrice: number | null;
  taxRate: number | null; // null if country missing
  countryId: string | null;
  lowestObserved: SkillNumbers | null;
  skillKeys: string[];
  activeBands: SkillBand[];
  marketMedian: number | null; // 24h + bands
  sellerNet: number | null; // market / (1+tax) when both known
  scrapFloor: number | null;
  recommend: RecommendListing | null; // null if no tier/scrap/tax
  trades: number;
  dailyMedians: { day: string; median: number; trades: number }[]; // UTC date YYYY-MM-DD, lookback 7d, band-filtered
  ladder: { bucketLabel: string; median: number; trades: number }[]; // single-skill items: bucket by that skill; multi-skill: bucket by first skillKeys[0] while other skills still AND-matched to activeBands
};
```

**Query params:**
- `countryId` optional string
- `skills` optional JSON string of `SkillBand[]`
- If `skills` omitted/empty: use `lowestObserved` as targets with `band: 1` for each key (so first paint has numbers)

Parse skills:

```ts
function parseSkillsQuery(raw: string | undefined): SkillBand[] | null {
  if (!raw?.trim()) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) throw new Error("not array");
    return v.map((row) => {
      const r = row as SkillBand;
      if (typeof r.key !== "string" || typeof r.target !== "number" || typeof r.band !== "number") {
        throw new Error("bad band");
      }
      return { key: r.key, target: r.target, band: r.band };
    });
  } catch {
    throw new HttpError(400, "bad_request", "skills must be a JSON array of {key,target,band}");
  }
}
```

Ladder (v1): for `skillKeys[0]`, build integer buckets spanning observed min…max for that key among txs that match the **other** bands (or all txs if only one skill); median price per bucket.

- [ ] **Step 1: Write failing tests** for `buildEquipmentDetail` (fixed clock txs) and API `GET /chest4?skills=…&countryId=…`

- [ ] **Step 2: Run — expect FAIL**

```bash
vp test src/equipment/detail.test.ts src/server/routes/equipment.test.ts
```

- [ ] **Step 3: Implement `buildEquipmentDetail` + `GET /:itemCode`**

Load country: `db.select().from(countries).where(eq(countries.id, countryId))` — if missing, `taxRate: null`, `recommend: null`, `sellerNet: null`.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(api): add equipment item detail with skill bands

EOF
)"
```

---

### Task 6: Client persistence — country + loadStats

**Files:**
- Create: `src/web/lib/equipmentPrefs.ts`
- Create: `src/web/lib/equipmentPrefs.test.ts`
- Create: `src/web/lib/equipmentStats.ts`
- Create: `src/web/lib/equipmentStats.test.ts`

**Interfaces:**
- Consumes: `SkillBand` type — either duplicate a thin web type or import from `@/equipment/skills` if web tsconfig allows (prefer import from `src/equipment/skills.ts` like calculator imports `@/calculator`)
- Produces:
  - `export const EQUIPMENT_PREFS_KEY = "equipmentPrefs:v1"`
  - `export function loadEquipmentCountryId(): string | null`
  - `export function saveEquipmentCountryId(countryId: string): void`
  - `export function equipmentStatsKey(itemCode: string): string` → `equipmentStats:v1:${itemCode}`
  - `export type StoredEquipmentStats = { targets: Record<string, number>; bands: Record<string, number> }`
  - `export function loadStoredEquipmentStats(itemCode: string): StoredEquipmentStats | null`
  - `export function saveStoredEquipmentStats(itemCode: string, stats: StoredEquipmentStats): void`
  - `export function loadStats(itemCode: string, lowestObserved: SkillNumbers | null): SkillBand[]`

`loadStats` logic:

```ts
export function loadStats(itemCode: string, lowestObserved: SkillNumbers | null): SkillBand[] {
  const stored = loadStoredEquipmentStats(itemCode);
  if (stored && Object.keys(stored.targets).length > 0) {
    return Object.keys(stored.targets).map((key) => ({
      key,
      target: stored.targets[key]!,
      band: stored.bands[key] ?? 1,
    }));
  }
  if (!lowestObserved) return [];
  return Object.entries(lowestObserved).map(([key, target]) => ({
    key,
    target,
    band: 1,
  }));
}
```

Fail soft on JSON errors (return null / []).

- [ ] **Step 1: Write failing tests** with mocked `localStorage` (same pattern as `recentCompaniesPlayers` tests if present; else simple in-memory mock)

- [ ] **Step 2–4: Implement, pass, commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): persist equipment country and per-item stat bands

EOF
)"
```

---

### Task 7: Overview page + routes + nav

**Files:**
- Create: `src/web/features/equipment-market/types.ts`
- Create: `src/web/features/equipment-market/EquipmentOverviewPage.tsx`
- Create: `src/web/routes/equipment.tsx`
- Modify: `src/web/layout/Shell.tsx` — add `{ to: "/equipment", label: "Equipment" }` after Market
- Mark design status Approved in spec (small edit)

**Behavior:**
- On mount: `api<OverviewResponse>("/api/equipment/overview")`
- Load countries via `GET /api/countries`; Combobox country from `loadEquipmentCountryId()` or default SE / first (same heuristic as Calculator) but **save** via `saveEquipmentCountryId` only (never Calculator keys)
- Group `items` by tier order gray→red then `null` as “Unknown”
- Table columns: Item (ItemIcon + formatEquipmentItem), Market, Scrap floor, Spread, Trades
- Market null → “—”; spread color: ≥10 success-ish, &lt;3 warning/danger using existing CSS tokens
- Row click / Link → `/equipment/$itemCode`
- Show scrap price + window in chrome
- Country shown for seller context (tax %); overview numbers do not need excl

- [ ] **Step 1: Add route file**

```ts
// src/web/routes/equipment.tsx
import { createFileRoute } from "@tanstack/react-router";
import { EquipmentOverviewPage } from "../features/equipment-market/EquipmentOverviewPage";

export const Route = createFileRoute("/equipment")({
  component: EquipmentOverviewPage,
});
```

- [ ] **Step 2: Implement overview UI** (follow `MarketPage` layout density / war-command dark styles)

- [ ] **Step 3: Add Shell tab; run `vp run build` or dev route generation as this repo usually does for TanStack Router**

- [ ] **Step 4: Manual smoke** — open `/equipment` with ingested txs (dev server)

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): add equipment market overview page

EOF
)"
```

Also set design doc status to `Approved for implementation`.

---

### Task 8: Detail page — bands, triad, recommend

**Files:**
- Create: `src/web/features/equipment-market/EquipmentDetailPage.tsx`
- Create: `src/web/features/equipment-market/SkillBandControls.tsx`
- Create: `src/web/routes/equipment_.$itemCode.tsx`
- Optional: `src/web/lib/equipmentSearch.ts` if search params needed later (v1 can keep bands in React state only)

**Behavior:**
1. Fetch detail **without** `skills` once → read `lowestObserved`
2. `bands = loadStats(itemCode, lowestObserved)`
3. Refetch `GET /api/equipment/${itemCode}?skills=${encodeURIComponent(JSON.stringify(bands))}&countryId=…`
4. Controls: per skill number input (target) + ± band input; on change debounce 200ms → `saveStoredEquipmentStats` + refetch
5. Triad stats: Market incl, Seller excl (toggle hide), Scrap floor
6. Recommend strip: break-even / attractive / vs market (from payload.recommend)
7. Disable excl + recommend when `taxRate == null`; prompt to pick country
8. Back link to `/equipment`

```ts
export const Route = createFileRoute("/equipment_/$itemCode")({
  component: EquipmentDetailPage,
});
```

Use `getRouteApi("/equipment_/$itemCode")` for `itemCode` param.

- [ ] **Step 1–4: Implement, smoke on `/equipment/chest4`, commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): add equipment detail with skill bands and recommend strip

EOF
)"
```

---

### Task 9: Detail charts (daily trend + ladder)

**Files:**
- Create: `src/web/features/equipment-market/EquipmentTrendChart.tsx`
- Create: `src/web/features/equipment-market/EquipmentLadderChart.tsx`
- Modify: `EquipmentDetailPage.tsx`

**Interfaces:**
- Consumes: `dailyMedians` and `ladder` from detail API; chart imports like `MarketPriceChart.tsx`:

```ts
import { defineChart, lineY, barY } from "@tanstack/charts";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
```

(Adjust mark helpers to whatever `@tanstack/charts` version in package.json exports — copy from `MarketPriceChart.tsx` / `GrowthPathChart.tsx`.)

- Trend: line of daily median; optional horizontal reference for scrap floor if constant
- Ladder: bar chart of bucket medians
- If arrays empty: omit chart (no empty frame); show short text “No sales in band”

- [ ] **Step 1: Implement charts; wire into detail**

- [ ] **Step 2: `vp check` and targeted tests**

```bash
vp test src/equipment src/db/item-market-tx-read.test.ts src/server/routes/equipment.test.ts src/web/lib/equipmentPrefs.test.ts src/web/lib/equipmentStats.test.ts
vp check
```

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): chart equipment price trend and stat ladder

EOF
)"
```

---

### Task 10: Spec status + AGENTS one-liner (optional polish)

**Files:**
- Modify: `docs/superpowers/specs/2026-08-05-equipment-market-pricing-design.md` — Status: Approved for implementation (if not done in Task 7)
- Modify: `AGENTS.md` — under Web UI or Data tiers, one line: Equipment Market reads `item_market_transactions` via `/api/equipment`

- [ ] **Step 1: Edit docs**

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: approve equipment market design and note in AGENTS

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Overview market + floor + spread + trades | 4, 7 |
| Detail triad + recommend via calculateProfit math | 2, 5, 8 |
| Per-skill ±band, default ±1, remembered | 1, 6, 8 |
| First visit lowest observed | 1, 5, 6 |
| `loadStats` abstraction | 6 |
| Independent country | 6, 7, 8 |
| Median not min | 1, 4, 5 |
| Multi-day trend + ladder | 5, 9 |
| 24h window | `windows.ts` + 4/5 |
| Calculator kept | Global constraints |
| Empty / no country / no scrap | 5, 8 |
| Unit + API + prefs tests | 1–6 |
| No new pollers | Global constraints |
| Tier mapping gap | Task 2 suffix + overrides |

**Locked open points:** skills JSON query; 5% attractive; nav label “Equipment”; keep scrap floor column on overview; unknown tiers → Unknown group.

**Follow-ups (not this plan):** weapon override tiers from live codes; build profiles; 7d window control; budget line; Calculator deprecation.
