# Market Price Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename Economy → Companies and ship a Market tab with current price cards plus per-item history charts (range ribbon + market line) via TanStack Charts.

**Architecture:** Keep append-only `price_polls` / `price_snapshots` as the source of truth. Add pure helpers for range/change/grouping, a DB history reader, and `GET /api/prices/history`. Web: `/companies` (moved advisor), `/market` overview, `/market/$itemCode` detail with an isolated chart module.

**Tech Stack:** TypeScript, Hono, Drizzle/libsql, TanStack Router, `@tanstack/charts` + `@tanstack/react-charts`, `d3-scale`, Vitest via `vp test`, Vite+ (`vp check`).

**Design:** [2026-08-01-market-price-charts-design.md](../specs/2026-08-01-market-price-charts-design.md)

## Global Constraints

- No `/economy` redirect
- Keep `/api/economy/*` paths unchanged
- No schema/migration in v1
- Top buy = `buyMax`; top sell = `sellMin`
- Chart: ribbon (top buy–top sell) + market line only (no candlesticks / G/PP on cards)
- History ranges: `24h` | `7d` | `30d`; bad/missing → `7d`
- Change stats only on detail header (Δ 24h + Δ 7d)
- No TanStack Query in v1
- Pin TanStack Charts versions; isolate chart UI in `src/web/features/market/`
- Prefer `vp test` / `vp check` for verification
- Commit after each task

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/market/ranges.ts` | Parse/coerce range; range → ms |
| `src/market/change.ts` | Absolute/% change helpers |
| `src/market/groupItems.ts` | Raw / manufactured / other grouping |
| `src/market/*.test.ts` | Unit tests for helpers |
| `src/db/price-history.ts` | Query history + baselines + latest for one item |
| `src/db/price-history.test.ts` | History windowing + change baselines |
| `src/server/routes/prices.ts` | Add `GET /history` |
| `src/server/routes/prices.test.ts` | API tests for history |
| `src/web/routes/companies.tsx` | Former `/economy` route |
| `src/web/features/companies/*` | Moved advisor UI (from `features/economy`) |
| `src/web/lib/companiesSearch.ts` | Search params (renamed from economySearch) |
| `src/web/lib/recentCompaniesPlayers.ts` | Recent players key `companiesRecentPlayers:v1` |
| `src/web/routes/market.tsx` | Overview route |
| `src/web/routes/market.$itemCode.tsx` | Detail route + `range` search |
| `src/web/features/market/*` | Overview, detail, chart, types |
| `src/web/layout/Shell.tsx` | Nav: Companies + Market |
| `package.json` | Chart + d3 deps |

Delete after move: `src/web/routes/economy.tsx`, `src/web/features/economy/*`, old economy search/recent helpers (once imports updated).

---

### Task 1: Market pure helpers (range, change, grouping)

**Files:**
- Create: `src/market/ranges.ts`
- Create: `src/market/ranges.test.ts`
- Create: `src/market/change.ts`
- Create: `src/market/change.test.ts`
- Create: `src/market/groupItems.ts`
- Create: `src/market/groupItems.test.ts`

**Interfaces:**
- Consumes: `getRecipe` from `src/economy/recipes.ts`
- Produces:
  - `export type PriceHistoryRange = "24h" | "7d" | "30d"`
  - `export const PRICE_HISTORY_RANGES: readonly PriceHistoryRange[]`
  - `export function parsePriceHistoryRange(value: unknown): PriceHistoryRange`
  - `export function rangeToMs(range: PriceHistoryRange): number`
  - `export type PriceChange = { absolute: number; percent: number }`
  - `export function calculatePriceChange(current: number | null, baseline: number | null): PriceChange | null`
  - `export type MarketItemGroup = "raw" | "manufactured" | "other"`
  - `export function marketItemGroup(itemCode: string): MarketItemGroup`
  - `export function groupMarketItems<T extends { itemCode: string }>(items: T[]): { raw: T[]; manufactured: T[]; other: T[] }`

- [ ] **Step 1: Write failing tests**

`src/market/ranges.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { parsePriceHistoryRange, rangeToMs } from "./ranges";

describe("parsePriceHistoryRange", () => {
  it("accepts known ranges", () => {
    expect(parsePriceHistoryRange("24h")).toBe("24h");
    expect(parsePriceHistoryRange("7d")).toBe("7d");
    expect(parsePriceHistoryRange("30d")).toBe("30d");
  });

  it("coerces bad or missing values to 7d", () => {
    expect(parsePriceHistoryRange(undefined)).toBe("7d");
    expect(parsePriceHistoryRange("")).toBe("7d");
    expect(parsePriceHistoryRange("1y")).toBe("7d");
    expect(parsePriceHistoryRange(7)).toBe("7d");
  });
});

describe("rangeToMs", () => {
  it("maps ranges to durations", () => {
    expect(rangeToMs("24h")).toBe(24 * 60 * 60 * 1000);
    expect(rangeToMs("7d")).toBe(7 * 24 * 60 * 60 * 1000);
    expect(rangeToMs("30d")).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
```

`src/market/change.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { calculatePriceChange } from "./change";

describe("calculatePriceChange", () => {
  it("returns absolute and percent", () => {
    expect(calculatePriceChange(1.1, 1.0)).toEqual({ absolute: 0.1, percent: 10 });
  });

  it("returns null when current, baseline, or baseline zero is unusable", () => {
    expect(calculatePriceChange(null, 1)).toBeNull();
    expect(calculatePriceChange(1, null)).toBeNull();
    expect(calculatePriceChange(1, 0)).toBeNull();
    expect(calculatePriceChange(Number.NaN, 1)).toBeNull();
  });
});
```

`src/market/groupItems.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { groupMarketItems, marketItemGroup } from "./groupItems";

describe("marketItemGroup", () => {
  it("classifies recipe items", () => {
    expect(marketItemGroup("grain")).toBe("raw");
    expect(marketItemGroup("steel")).toBe("manufactured");
    expect(marketItemGroup("scraps")).toBe("other");
  });
});

describe("groupMarketItems", () => {
  it("buckets and preserves order within groups", () => {
    const items = [
      { itemCode: "steel" },
      { itemCode: "grain" },
      { itemCode: "scraps" },
      { itemCode: "iron" },
    ];
    expect(groupMarketItems(items)).toEqual({
      raw: [{ itemCode: "grain" }, { itemCode: "iron" }],
      manufactured: [{ itemCode: "steel" }],
      other: [{ itemCode: "scraps" }],
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/market/ranges.test.ts src/market/change.test.ts src/market/groupItems.test.ts`  
Expected: FAIL (modules missing)

- [ ] **Step 3: Implement helpers**

`src/market/ranges.ts`:

```ts
export const PRICE_HISTORY_RANGES = ["24h", "7d", "30d"] as const;
export type PriceHistoryRange = (typeof PRICE_HISTORY_RANGES)[number];

const RANGE_MS: Record<PriceHistoryRange, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function parsePriceHistoryRange(value: unknown): PriceHistoryRange {
  if (typeof value === "string" && (PRICE_HISTORY_RANGES as readonly string[]).includes(value)) {
    return value as PriceHistoryRange;
  }
  return "7d";
}

export function rangeToMs(range: PriceHistoryRange): number {
  return RANGE_MS[range];
}
```

`src/market/change.ts`:

```ts
export type PriceChange = { absolute: number; percent: number };

export function calculatePriceChange(
  current: number | null,
  baseline: number | null,
): PriceChange | null {
  if (
    current == null ||
    baseline == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(baseline) ||
    baseline === 0
  ) {
    return null;
  }
  const absolute = current - baseline;
  return { absolute, percent: (absolute / baseline) * 100 };
}
```

`src/market/groupItems.ts`:

```ts
import { getRecipe } from "../economy/recipes";

export type MarketItemGroup = "raw" | "manufactured" | "other";

export function marketItemGroup(itemCode: string): MarketItemGroup {
  const recipe = getRecipe(itemCode);
  if (!recipe) return "other";
  return recipe.inputs.length === 0 ? "raw" : "manufactured";
}

export function groupMarketItems<T extends { itemCode: string }>(items: T[]): {
  raw: T[];
  manufactured: T[];
  other: T[];
} {
  const raw: T[] = [];
  const manufactured: T[] = [];
  const other: T[] = [];
  for (const item of items) {
    const group = marketItemGroup(item.itemCode);
    if (group === "raw") raw.push(item);
    else if (group === "manufactured") manufactured.push(item);
    else other.push(item);
  }
  return { raw, manufactured, other };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/market/ranges.test.ts src/market/change.test.ts src/market/groupItems.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/market/
git commit -m "feat(market): add range, change, and item grouping helpers"
```

---

### Task 2: Price history DB reader

**Files:**
- Create: `src/db/price-history.ts`
- Create: `src/db/price-history.test.ts`

**Interfaces:**
- Consumes: `Db`, `pricePolls`, `priceSnapshots`, `parsePriceHistoryRange` / `rangeToMs`, `calculatePriceChange`
- Produces:
  - `export type PriceHistoryPoint = { recordedAt: Date; marketPrice: number | null; topBuy: number | null; topSell: number | null }`
  - `export type ItemPriceHistory = { itemCode: string; range: PriceHistoryRange; latest: PriceHistoryPoint | null; change24h: PriceChange | null; change7d: PriceChange | null; points: PriceHistoryPoint[] }`
  - `export async function getItemPriceHistory(db: Db, itemCode: string, range: PriceHistoryRange, now?: Date): Promise<ItemPriceHistory | null>`
  - Returns `null` when the item has never appeared in any successful/partial poll snapshot

- [ ] **Step 1: Write failing tests**

`src/db/price-history.test.ts` — use the same in-memory `price_polls` / `price_snapshots` DDL as `src/server/routes/scraps.test.ts`. Seed three steel snapshots at T0 (now−8d), T1 (now−2d), T2 (now), plus a grain-only poll to prove item filtering.

```ts
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { insertPricePoll, insertPriceSnapshots } from "./prices";
import type { Db } from "./client";
import * as schema from "./schema";
import { getItemPriceHistory } from "./price-history";

async function createMemoryDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  await client.execute(`
    CREATE TABLE price_polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      recorded_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      item_count INTEGER DEFAULT 0 NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE price_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      poll_id INTEGER NOT NULL,
      item_code TEXT NOT NULL,
      market_price REAL,
      buy_min REAL,
      buy_max REAL,
      buy_avg REAL,
      sell_min REAL,
      sell_max REAL,
      sell_avg REAL,
      FOREIGN KEY (poll_id) REFERENCES price_polls(id)
    )
  `);
  return drizzle(client, { schema });
}

async function seedSnapshot(
  db: Db,
  recordedAt: Date,
  itemCode: string,
  marketPrice: number,
  buyMax: number,
  sellMin: number,
) {
  const pollId = await insertPricePoll(db, {
    recordedAt,
    status: "success",
    itemCount: 1,
  });
  await insertPriceSnapshots(db, pollId, [
    {
      itemCode,
      marketPrice,
      buyMin: buyMax,
      buyMax,
      buyAvg: buyMax,
      sellMin,
      sellMax: sellMin,
      sellAvg: sellMin,
    },
  ]);
}

describe("getItemPriceHistory", () => {
  let db: Db;
  const now = new Date("2026-08-01T12:00:00.000Z");

  beforeEach(async () => {
    db = await createMemoryDb();
  });

  it("returns null for unknown item", async () => {
    expect(await getItemPriceHistory(db, "steel", "7d", now)).toBeNull();
  });

  it("windows points and computes 24h/7d changes from market baselines", async () => {
    await seedSnapshot(db, new Date("2026-07-24T12:00:00.000Z"), "steel", 1.0, 0.9, 1.1);
    await seedSnapshot(db, new Date("2026-07-30T12:00:00.000Z"), "steel", 1.5, 1.4, 1.6);
    await seedSnapshot(db, new Date("2026-08-01T12:00:00.000Z"), "steel", 1.65, 1.55, 1.7);

    const history = await getItemPriceHistory(db, "steel", "7d", now);
    expect(history).not.toBeNull();
    expect(history!.range).toBe("7d");
    expect(history!.points).toHaveLength(2); // excludes 8d-old point
    expect(history!.latest?.marketPrice).toBe(1.65);
    expect(history!.latest?.topBuy).toBe(1.55);
    expect(history!.latest?.topSell).toBe(1.7);
    // baseline ~now-24h → 1.5; baseline ~now-7d → 1.0
    expect(history!.change24h).toEqual({
      absolute: expect.closeTo(0.15, 8),
      percent: expect.closeTo(10, 8),
    });
    expect(history!.change7d).toEqual({
      absolute: expect.closeTo(0.65, 8),
      percent: expect.closeTo(65, 8),
    });
  });

  it("ignores error polls", async () => {
    const pollId = await insertPricePoll(db, {
      recordedAt: now,
      status: "error",
      itemCount: 0,
    });
    await insertPriceSnapshots(db, pollId, [
      {
        itemCode: "steel",
        marketPrice: 9,
        buyMin: null,
        buyMax: null,
        buyAvg: null,
        sellMin: null,
        sellMax: null,
        sellAvg: null,
      },
    ]);
    expect(await getItemPriceHistory(db, "steel", "7d", now)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/db/price-history.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement `getItemPriceHistory`**

`src/db/price-history.ts`:

```ts
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { calculatePriceChange, type PriceChange } from "../market/change";
import { rangeToMs, type PriceHistoryRange } from "../market/ranges";
import type { Db } from "./client";
import { pricePolls, priceSnapshots } from "./schema";

export type PriceHistoryPoint = {
  recordedAt: Date;
  marketPrice: number | null;
  topBuy: number | null;
  topSell: number | null;
};

export type ItemPriceHistory = {
  itemCode: string;
  range: PriceHistoryRange;
  latest: PriceHistoryPoint | null;
  change24h: PriceChange | null;
  change7d: PriceChange | null;
  points: PriceHistoryPoint[];
};

const OK_STATUSES = ["success", "partial"] as const;

function mapRow(row: {
  recordedAt: Date;
  marketPrice: number | null;
  buyMax: number | null;
  sellMin: number | null;
}): PriceHistoryPoint {
  return {
    recordedAt: row.recordedAt,
    marketPrice: row.marketPrice,
    topBuy: row.buyMax,
    topSell: row.sellMin,
  };
}

async function latestBaselineAtOrBefore(
  db: Db,
  itemCode: string,
  atOrBefore: Date,
): Promise<number | null> {
  const rows = await db
    .select({ marketPrice: priceSnapshots.marketPrice })
    .from(priceSnapshots)
    .innerJoin(pricePolls, eq(priceSnapshots.pollId, pricePolls.id))
    .where(
      and(
        eq(priceSnapshots.itemCode, itemCode),
        inArray(pricePolls.status, [...OK_STATUSES]),
        lte(pricePolls.recordedAt, atOrBefore),
      ),
    )
    .orderBy(desc(pricePolls.recordedAt), desc(pricePolls.id))
    .limit(1);
  const price = rows[0]?.marketPrice;
  return price != null && Number.isFinite(price) ? price : null;
}

export async function getItemPriceHistory(
  db: Db,
  itemCode: string,
  range: PriceHistoryRange,
  now: Date = new Date(),
): Promise<ItemPriceHistory | null> {
  const latestRows = await db
    .select({
      recordedAt: pricePolls.recordedAt,
      marketPrice: priceSnapshots.marketPrice,
      buyMax: priceSnapshots.buyMax,
      sellMin: priceSnapshots.sellMin,
    })
    .from(priceSnapshots)
    .innerJoin(pricePolls, eq(priceSnapshots.pollId, pricePolls.id))
    .where(
      and(
        eq(priceSnapshots.itemCode, itemCode),
        inArray(pricePolls.status, [...OK_STATUSES]),
      ),
    )
    .orderBy(desc(pricePolls.recordedAt), desc(pricePolls.id))
    .limit(1);

  const latestRow = latestRows[0];
  if (!latestRow) return null;

  const since = new Date(now.getTime() - rangeToMs(range));
  const pointRows = await db
    .select({
      recordedAt: pricePolls.recordedAt,
      marketPrice: priceSnapshots.marketPrice,
      buyMax: priceSnapshots.buyMax,
      sellMin: priceSnapshots.sellMin,
    })
    .from(priceSnapshots)
    .innerJoin(pricePolls, eq(priceSnapshots.pollId, pricePolls.id))
    .where(
      and(
        eq(priceSnapshots.itemCode, itemCode),
        inArray(pricePolls.status, [...OK_STATUSES]),
        gte(pricePolls.recordedAt, since),
      ),
    )
    .orderBy(asc(pricePolls.recordedAt), asc(pricePolls.id));

  const latest = mapRow(latestRow as typeof pointRows[0]);
  const baseline24h = await latestBaselineAtOrBefore(
    db,
    itemCode,
    new Date(now.getTime() - rangeToMs("24h")),
  );
  const baseline7d = await latestBaselineAtOrBefore(
    db,
    itemCode,
    new Date(now.getTime() - rangeToMs("7d")),
  );

  return {
    itemCode,
    range,
    latest,
    change24h: calculatePriceChange(latest.marketPrice, baseline24h),
    change7d: calculatePriceChange(latest.marketPrice, baseline7d),
    points: pointRows.map((row) => mapRow(row)),
  };
}
```

Remove unused `sql` import if the linter flags it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/db/price-history.test.ts`  
Expected: PASS  
If `change24h` baseline picks the wrong row because “exactly 24h ago” has no row, adjust the seed timestamps so T1 is clearly ≤ now−24h (as written: `2026-07-30T12` vs `2026-08-01T12`).

- [ ] **Step 5: Commit**

```bash
git add src/db/price-history.ts src/db/price-history.test.ts
git commit -m "feat(db): read per-item price history and change baselines"
```

---

### Task 3: `GET /api/prices/history` route

**Files:**
- Modify: `src/server/routes/prices.ts`
- Create: `src/server/routes/prices.test.ts`

**Interfaces:**
- Consumes: `getItemPriceHistory`, `parsePriceHistoryRange`
- Produces: JSON matching the design response (ISO dates); 404 when history is null

- [ ] **Step 1: Write failing API tests**

`src/server/routes/prices.test.ts` — mount `pricesRoutes` with memory DB + silent logger + stub warera (unused for history). Cover:

1. Happy path returns points + changes  
2. Missing/bad `range` coerces to `7d`  
3. Unknown item → thrown/handled as 404 (`HttpError` or app response status 404)  
4. Missing `itemCode` → 400

Follow patterns from other Hono route tests in the repo if present; otherwise call the route handler via `app.request("http://localhost/history?itemCode=steel&range=7d")` after `pricesRoutes({ db, warera, logger })`.

```ts
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { insertPricePoll, insertPriceSnapshots } from "../../db/prices";
import type { Db } from "../../db/client";
import * as schema from "../../db/schema";
import type { Logger } from "../../logging/logger";
import { pricesRoutes } from "./prices";

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => silentLogger,
} as unknown as Logger;

async function createMemoryDb(): Promise<Db> {
  // same DDL as price-history.test.ts
}

function appFor(db: Db) {
  return pricesRoutes({
    db,
    warera: { request: async () => { throw new Error("unused"); } },
    logger: silentLogger,
  });
}

describe("GET /history", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createMemoryDb();
  });

  it("returns history for an item", async () => {
    const recordedAt = new Date("2026-08-01T12:00:00.000Z");
    const pollId = await insertPricePoll(db, {
      recordedAt,
      status: "success",
      itemCount: 1,
    });
    await insertPriceSnapshots(db, pollId, [
      {
        itemCode: "steel",
        marketPrice: 1.6,
        buyMin: 1.5,
        buyMax: 1.5,
        buyAvg: 1.5,
        sellMin: 1.7,
        sellMax: 1.7,
        sellAvg: 1.7,
      },
    ]);

    const res = await appFor(db).request(
      "http://localhost/history?itemCode=steel&range=7d",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.itemCode).toBe("steel");
    expect(body.range).toBe("7d");
    expect(body.latest.marketPrice).toBe(1.6);
    expect(body.latest.topBuy).toBe(1.5);
    expect(body.latest.topSell).toBe(1.7);
    expect(body.points).toHaveLength(1);
  });

  it("coerces bad range to 7d", async () => {
    const pollId = await insertPricePoll(db, {
      recordedAt: new Date(),
      status: "success",
      itemCount: 1,
    });
    await insertPriceSnapshots(db, pollId, [
      {
        itemCode: "steel",
        marketPrice: 1,
        buyMin: null,
        buyMax: null,
        buyAvg: null,
        sellMin: null,
        sellMax: null,
        sellAvg: null,
      },
    ]);
    const res = await appFor(db).request(
      "http://localhost/history?itemCode=steel&range=nope",
    );
    expect(res.status).toBe(200);
    expect((await res.json()).range).toBe("7d");
  });

  it("404s for unknown item", async () => {
    const res = await appFor(db).request(
      "http://localhost/history?itemCode=missing&range=7d",
    );
    expect(res.status).toBe(404);
  });

  it("400s without itemCode", async () => {
    const res = await appFor(db).request("http://localhost/history?range=7d");
    expect(res.status).toBe(400);
  });
});
```

Fill in `createMemoryDb` DDL identically to Task 2.

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/server/routes/prices.test.ts`  
Expected: FAIL (route missing or 404 on all)

- [ ] **Step 3: Add the route**

In `src/server/routes/prices.ts`, import helpers and add:

```ts
import { getItemPriceHistory } from "../../db/price-history";
import { parsePriceHistoryRange } from "../../market/ranges";

// inside pricesRoutes, before return:
app.get("/history", async (c) => {
  const itemCodeRaw = c.req.query("itemCode");
  const itemCode = itemCodeRaw?.trim() ?? "";
  if (!itemCode) {
    throw new HttpError(400, "bad_request", "itemCode is required");
  }
  const range = parsePriceHistoryRange(c.req.query("range"));
  const history = await getItemPriceHistory(db, itemCode, range);
  if (!history) {
    throw new HttpError(404, "not_found", `No price history for ${itemCode}`);
  }
  const isoPoint = (p: NonNullable<typeof history.latest>) => ({
    recordedAt: p.recordedAt.toISOString(),
    marketPrice: p.marketPrice,
    topBuy: p.topBuy,
    topSell: p.topSell,
  });
  return c.json({
    itemCode: history.itemCode,
    range: history.range,
    latest: history.latest ? isoPoint(history.latest) : null,
    change24h: history.change24h,
    change7d: history.change7d,
    points: history.points.map(isoPoint),
  });
});
```

Ensure the app’s error middleware maps `HttpError` to JSON status (already used elsewhere).

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/server/routes/prices.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/prices.ts src/server/routes/prices.test.ts
git commit -m "feat(api): add GET /api/prices/history"
```

---

### Task 4: Rename Economy → Companies

**Files:**
- Create: `src/web/routes/companies.tsx`
- Create: `src/web/features/companies/*` (move from `features/economy`)
- Create: `src/web/lib/companiesSearch.ts` (+ test move/rename from `economySearch`)
- Create: `src/web/lib/recentCompaniesPlayers.ts` (new key `companiesRecentPlayers:v1`; optionally read legacy `economyRecentPlayers:v1` once)
- Modify: `src/web/layout/Shell.tsx` — replace Economy tab with Companies (`/companies`)
- Delete: `src/web/routes/economy.tsx`, `src/web/features/economy/*`, old economy search/recent files after updates
- Regenerate: `src/web/routeTree.gen.ts` (TanStack router plugin on `vp dev` / build)

**Interfaces:**
- Consumes: existing advisor API `/api/economy/*`
- Produces: route `/companies` with same search params (`userId`, `username`)

- [ ] **Step 1: Move web feature + route**

1. `git mv src/web/features/economy src/web/features/companies`
2. Rename `EconomyPage.tsx` → `CompaniesPage.tsx`, `EconomyPlayerSearch.tsx` → `CompaniesPlayerSearch.tsx`; update component names and `getRouteApi("/companies")`.
3. `git mv src/web/lib/economySearch.ts src/web/lib/companiesSearch.ts` (and `.test.ts`); rename exported types/functions to `CompaniesSearch` / `parseCompaniesSearch` / `buildCompaniesSearch`.
4. Replace `recentEconomyPlayers.ts` with `recentCompaniesPlayers.ts` using key `companiesRecentPlayers:v1`. In `loadRecentCompaniesPlayers`, if new key empty, try reading `economyRecentPlayers:v1` once and migrate into the new key.
5. Create `src/web/routes/companies.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { CompaniesPage } from "../features/companies/CompaniesPage";
import { parseCompaniesSearch } from "../lib/companiesSearch";

export const Route = createFileRoute("/companies")({
  validateSearch: (search: Record<string, unknown>) => parseCompaniesSearch(search),
  component: CompaniesPage,
});
```

6. Delete `src/web/routes/economy.tsx`.
7. Update all imports inside the moved feature (api paths stay `/api/economy/...`).

- [ ] **Step 2: Update Shell nav**

In `src/web/layout/Shell.tsx` tabs array, replace:

```ts
{ to: "/economy", label: "Economy" },
```

with:

```ts
{ to: "/companies", label: "Companies" },
```

(Market tab added in Task 5.)

- [ ] **Step 3: Verify typecheck / tests for search helpers**

Run: `vp test src/web/lib/companiesSearch.test.ts`  
Run: `vp check`  
Expected: PASS (route tree may regenerate during check/dev; if `routeTree.gen.ts` still references `/economy`, run `vp dev` briefly or the project’s router codegen so it picks up `/companies`).

- [ ] **Step 4: Commit**

```bash
git add src/web/routes/companies.tsx src/web/features/companies src/web/lib/companiesSearch.ts src/web/lib/companiesSearch.test.ts src/web/lib/recentCompaniesPlayers.ts src/web/layout/Shell.tsx src/web/routeTree.gen.ts
git add -u src/web/routes/economy.tsx src/web/features/economy src/web/lib/economySearch.ts src/web/lib/economySearch.test.ts src/web/lib/recentEconomyPlayers.ts
git commit -m "refactor(web): rename Economy tab to Companies"
```

---

### Task 5: Market overview page

**Files:**
- Create: `src/web/routes/market.tsx`
- Create: `src/web/features/market/types.ts`
- Create: `src/web/features/market/MarketPage.tsx`
- Create: `src/web/features/market/MarketItemCard.tsx`
- Modify: `src/web/layout/Shell.tsx` — add Market tab
- Touch: `src/web/routeTree.gen.ts` via codegen

**Interfaces:**
- Consumes: `GET /api/prices/latest`, `groupMarketItems`, existing `ItemIcon` / `formatDisplayNumber` / `Button`
- Produces: clickable cards linking to `/market/$itemCode`

- [ ] **Step 1: Add types**

`src/web/features/market/types.ts`:

```ts
export type LatestPricesResponse = {
  pollId: number;
  recordedAt: string;
  status: string;
  items: Array<{
    itemCode: string;
    marketPrice: number | null;
    buyMin: number | null;
    buyMax: number | null;
    buyAvg: number | null;
    sellMin: number | null;
    sellMax: number | null;
    sellAvg: number | null;
  }>;
};

export type PriceHistoryPointDto = {
  recordedAt: string;
  marketPrice: number | null;
  topBuy: number | null;
  topSell: number | null;
};

export type PriceChangeDto = { absolute: number; percent: number };

export type PriceHistoryResponse = {
  itemCode: string;
  range: "24h" | "7d" | "30d";
  latest: PriceHistoryPointDto | null;
  change24h: PriceChangeDto | null;
  change7d: PriceChangeDto | null;
  points: PriceHistoryPointDto[];
};
```

- [ ] **Step 2: Implement card + page**

`MarketItemCard.tsx` — link wrapper to `/market/$itemCode` (default range via detail page). Show icon, formatted name, market badge, Top buy (`buyMax`, green), Top sell (`sellMin`, red). Match existing dark card styling from Companies/shadcn (`Card` or bordered button surface — prefer simple bordered link tiles consistent with the app, not a new design system).

`MarketPage.tsx`:

- Fetch `/api/prices/latest` on mount
- Refresh button → `POST /api/prices/poll` then reload latest
- `groupMarketItems(items)` → sections “Raw materials”, “Manufactured goods”, “Other” (skip empty)
- Loading / error / empty (“No price data yet — refresh prices”)

`src/web/routes/market.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { MarketPage } from "../features/market/MarketPage";

export const Route = createFileRoute("/market")({
  component: MarketPage,
});
```

- [ ] **Step 3: Add nav entry**

In `Shell.tsx` tabs, after Companies:

```ts
{ to: "/market", label: "Market" },
```

- [ ] **Step 4: Manual smoke**

Run: `vp run dev` (or project equivalent), open `/market`, confirm sections and card navigation target `/market/steel` (etc.).

- [ ] **Step 5: Commit**

```bash
git add src/web/routes/market.tsx src/web/features/market/ src/web/layout/Shell.tsx src/web/routeTree.gen.ts
git commit -m "feat(web): add Market overview with grouped price cards"
```

---

### Task 6: Market detail page + TanStack Charts

**Files:**
- Modify: `package.json` / lockfile via `pnpm add`
- Create: `src/web/routes/market.$itemCode.tsx`
- Create: `src/web/lib/marketSearch.ts` (+ optional small test)
- Create: `src/web/features/market/MarketItemPage.tsx`
- Create: `src/web/features/market/MarketPriceChart.tsx`
- Create: `src/web/features/market/formatItem.ts` (shared name helper if not already extracted)

**Interfaces:**
- Consumes: `GET /api/prices/history?itemCode=&range=`, `PRICE_HISTORY_RANGES`, `@tanstack/react-charts` `Chart`, `defineChart` / `areaY` / `lineY` from `@tanstack/charts`, `tooltip` from `@tanstack/charts/tooltip`, `scaleLinear` / `scaleUtc` from `d3-scale`
- Produces: detail UI with header deltas + chart

- [ ] **Step 1: Install dependencies**

```bash
pnpm add @tanstack/charts @tanstack/react-charts d3-scale
pnpm add -D @types/d3-scale
```

Pin whatever versions resolve; do not widen to unrelated TanStack packages.

- [ ] **Step 2: Search params helper**

`src/web/lib/marketSearch.ts`:

```ts
import { parsePriceHistoryRange, type PriceHistoryRange } from "../../market/ranges";

export type MarketItemSearch = { range: PriceHistoryRange };

export function parseMarketItemSearch(search: Record<string, unknown>): MarketItemSearch {
  return { range: parsePriceHistoryRange(search.range) };
}
```

- [ ] **Step 3: Chart module**

`MarketPriceChart.tsx` — accept `points: PriceHistoryPointDto[]`. Build rows with `Date` objects. Filter ribbon rows to those with both `topBuy` and `topSell` finite; filter line rows to finite `marketPrice`.

```tsx
import { areaY, defineChart, lineY } from "@tanstack/charts";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { scaleLinear, scaleUtc } from "d3-scale";
import { useMemo } from "react";
import type { PriceHistoryPointDto } from "./types";

type ChartRow = {
  date: Date;
  marketPrice: number | null;
  topBuy: number | null;
  topSell: number | null;
};

export function MarketPriceChart({
  points,
  itemLabel,
}: {
  points: PriceHistoryPointDto[];
  itemLabel: string;
}) {
  const rows = useMemo<ChartRow[]>(
    () =>
      points.map((p) => ({
        date: new Date(p.recordedAt),
        marketPrice: p.marketPrice,
        topBuy: p.topBuy,
        topSell: p.topSell,
      })),
    [points],
  );

  const ribbon = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.topBuy != null &&
          r.topSell != null &&
          Number.isFinite(r.topBuy) &&
          Number.isFinite(r.topSell),
      ),
    [rows],
  );

  const market = useMemo(
    () =>
      rows.filter((r) => r.marketPrice != null && Number.isFinite(r.marketPrice)),
    [rows],
  );

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          areaY(ribbon, {
            x: "date",
            y1: "topBuy",
            y2: "topSell",
            fillOpacity: 0.2,
          }),
          lineY(market, {
            x: "date",
            y: "marketPrice",
            strokeWidth: 2,
          }),
        ],
        x: { scale: scaleUtc, nice: true, axis: { label: "Time" } },
        y: { scale: scaleLinear, nice: true, grid: true, axis: { label: "Price" } },
        tooltip,
      }),
    [ribbon, market],
  );

  if (market.length === 0 && ribbon.length === 0) {
    return <p className="text-sm text-muted-foreground">No plottable points in this range.</p>;
  }

  return (
    <Chart
      definition={definition}
      height={360}
      ariaLabel={`${itemLabel} market price history`}
    />
  );
}
```

If tooltip formatting needs customization, use `@tanstack/react-charts/tooltip` and format date + market/topBuy/topSell in `renderTooltipBody`. Keep styling via inherited `currentColor` / CSS variables when possible.

- [ ] **Step 4: Detail page + route**

`MarketItemPage.tsx`:

- Read `itemCode` from route params, `range` from search
- Fetch `/api/prices/history?itemCode=...&range=...`
- Header: back `Link` to `/market`, icon, name, market / top buy / top sell, Δ 24h and Δ 7d (absolute + percent; muted “—” when null; green/red by sign)
- Range toggle buttons for `24h` | `7d` | `30d` calling `navigate({ search: { range } })`
- If `points.length < 3`, show note: “Limited history — more points appear as polls accumulate.”
- On 404: “Item not found or no price history yet.”

`src/web/routes/market.$itemCode.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { MarketItemPage } from "../features/market/MarketItemPage";
import { parseMarketItemSearch } from "../lib/marketSearch";

export const Route = createFileRoute("/market/$itemCode")({
  validateSearch: (search: Record<string, unknown>) => parseMarketItemSearch(search),
  component: MarketItemPage,
});
```

- [ ] **Step 5: Verify**

Run: `vp test`  
Run: `vp check`  
Manual: open an item, switch ranges, confirm chart + deltas.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/web/routes/market.\$itemCode.tsx src/web/lib/marketSearch.ts src/web/features/market/ src/web/routeTree.gen.ts
git commit -m "feat(web): add market item history chart with TanStack Charts"
```

---

### Task 7: Final verification pass

**Files:** none expected (fix only if check fails)

- [ ] **Step 1: Full test + check**

Run: `vp test`  
Run: `vp check`  
Expected: all green

- [ ] **Step 2: Spec checklist (manual)**

Confirm against the design:

- [ ] Companies nav + `/companies` advisor works  
- [ ] Market overview groups raw / manufactured / other  
- [ ] Cards show market + top buy + top sell only  
- [ ] Detail URL `/market/$itemCode?range=`  
- [ ] Ribbon + market line chart  
- [ ] Δ 24h / Δ 7d on detail only  
- [ ] No `/economy` redirect required  

- [ ] **Step 3: Commit any fixups** (only if Step 1 required code changes)

```bash
git add -u
git commit -m "fix: address market charts verification issues"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Rename Economy → Companies, no redirect | Task 4 |
| Market overview cards (market / buy / sell) | Task 5 |
| Raw / manufactured / other grouping | Tasks 1 + 5 |
| Detail route + range query | Task 6 |
| History API + change stats | Tasks 2–3 |
| Ribbon + market line (TanStack Charts) | Task 6 |
| Keep `/api/economy/*`, no schema change | Tasks 3–4 (unchanged) |
| Out of scope: G/PP cards, OHLC, Query | Not scheduled |

No TBD placeholders remain. Types (`PriceHistoryPoint`, `topBuy`/`topSell`, `PriceHistoryRange`) are consistent across Tasks 1–6.
