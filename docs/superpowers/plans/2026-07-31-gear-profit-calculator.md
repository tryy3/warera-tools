# Gear Profit Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a WebUI Calculator that compares market (incl-tax) gear listings to dismantle/scrap value, plus a Countries admin tab for tax rates, with scrap price cached from the WarEra API.

**Architecture:** Thin Hono API serves scrap price (24h DB cache + force refresh via `itemTrading.getPrices`) and countries CRUD. Pure tier yields and profit formulas live in `src/calculator/` and run in the browser for live updates. New shell tabs: Calculator and Countries.

**Tech Stack:** TypeScript, React, Hono, Drizzle/Turso, existing `src/warera` client + `getOrFetch` cache, Vitest via `vp test`, Vite+ (`vp check`).

## Global Constraints

- Follow design spec: `docs/superpowers/specs/2026-07-31-gear-profit-calculator-design.md`
- Browser talks only to Hono JSON API; no direct WarEra calls from the WebUI
- Only allowlisted WarEra procedure: `itemTrading.getPrices` (field `scraps`)
- Scrap cache key exactly `warera:scraps:price`; TTL `86400`
- Tax stored as fraction (`0.01`); UI edits percent (`1`)
- No country delete, no break-even output, no gear-type selector in v1
- Seed Sweden (`id: sweden`, `tax_rate: 0.01`) in migration
- Functional admin UI (same shell/CSS language as Jobs); not a marketing page
- `tsconfig.app.json` currently includes only `src/web` — must also include `src/calculator` so the SPA can import shared math
- Prefer `vp test` / `vp check` for verification

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/calculator/tiers.ts` | Hard-coded scrap yields per tier + tier metadata |
| `src/calculator/profit.ts` | Pure formulas: dismantle, excl, profit |
| `src/calculator/index.ts` | Public exports |
| `src/calculator/profit.test.ts` | Unit tests (incl. green-helmet example) |
| `src/db/schema.ts` | Add `countries` table |
| `src/db/cache.ts` | Add `getCachedRow` (ignore TTL) for stale scrap fallback |
| `src/db/cache.test.ts` | Cover `getCachedRow` / freshness if needed |
| `drizzle/0001_*.sql` (+ meta) | Migration: `countries` + Sweden seed |
| `src/server/routes/countries.ts` | Countries list/create/patch |
| `src/server/routes/countries.test.ts` | Validation / slug helpers tests (pure) or route logic tests |
| `src/server/routes/scraps.ts` | GET scraps + POST refresh |
| `src/server/routes/scraps.test.ts` | Service logic with mocked WarEra + in-memory/fake cache helpers |
| `src/warera/prices.ts` | Fetch + parse `itemTrading.getPrices` → scraps number |
| `src/warera/prices.test.ts` | Parse / error cases |
| `src/server/app.ts` | Mount routes; accept `warera` client in deps |
| `src/server/index.ts` | Pass WarEra client into `createApp` |
| `src/web/layout/Shell.tsx` | Add Calculator + Countries tabs |
| `src/web/App.tsx` | Route tab → pages |
| `src/web/features/calculator/*` | Calculator page + types |
| `src/web/features/countries/*` | Countries admin page + types |
| `src/web/index.css` | Minimal styles for calc breakdown / forms |
| `tsconfig.app.json` | Include `src/calculator` |

---

### Task 1: Pure calculator module

**Files:**
- Create: `src/calculator/tiers.ts`
- Create: `src/calculator/profit.ts`
- Create: `src/calculator/index.ts`
- Create: `src/calculator/profit.test.ts`
- Modify: `tsconfig.app.json` (include `src/calculator`)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export type GearTierId = "gray" | "green" | "blue" | "purple" | "yellow" | "red"`
  - `export type GearTier = { id: GearTierId; label: string; scraps: number }`
  - `export const GEAR_TIERS: readonly GearTier[]`
  - `export function scrapAmountForTier(tier: GearTierId): number`
  - `export type ProfitInput = { scrapPrice: number; scrapAmount: number; inclPrice: number; taxRate: number }`
  - `export type ProfitBreakdown = { dismantleValue: number; inclPrice: number; exclPrice: number; profit: number }`
  - `export function calculateProfit(input: ProfitInput): ProfitBreakdown`

- [ ] **Step 1: Write the failing test**

Create `src/calculator/profit.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { calculateProfit, scrapAmountForTier } from "./index";

describe("scrapAmountForTier", () => {
  it("returns hard-coded yields", () => {
    expect(scrapAmountForTier("gray")).toBe(6);
    expect(scrapAmountForTier("green")).toBe(18);
    expect(scrapAmountForTier("blue")).toBe(54);
    expect(scrapAmountForTier("purple")).toBe(162);
    expect(scrapAmountForTier("yellow")).toBe(486);
    expect(scrapAmountForTier("red")).toBe(1458);
  });
});

describe("calculateProfit", () => {
  it("matches green-helmet worked example", () => {
    const result = calculateProfit({
      scrapPrice: 0.215,
      scrapAmount: 18,
      inclPrice: 3.9,
      taxRate: 0.01,
    });
    expect(result.dismantleValue).toBeCloseTo(3.87, 5);
    expect(result.exclPrice).toBeCloseTo(3.8613861386, 5);
    expect(result.profit).toBeCloseTo(3.8613861386 - 3.87, 5);
    expect(result.inclPrice).toBe(3.9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/calculator/profit.test.ts`

Expected: FAIL (module not found / cannot resolve)

- [ ] **Step 3: Implement module + tsconfig include**

`src/calculator/tiers.ts`:

```ts
export type GearTierId = "gray" | "green" | "blue" | "purple" | "yellow" | "red";

export type GearTier = {
  id: GearTierId;
  label: string;
  scraps: number;
};

export const GEAR_TIERS: readonly GearTier[] = [
  { id: "gray", label: "Gray / Basic", scraps: 6 },
  { id: "green", label: "Green / Reinforced", scraps: 18 },
  { id: "blue", label: "Blue / Advanced", scraps: 54 },
  { id: "purple", label: "Purple / Elite", scraps: 162 },
  { id: "yellow", label: "Yellow / Legendary", scraps: 486 },
  { id: "red", label: "Red / Mythic", scraps: 1458 },
] as const;

export function scrapAmountForTier(tier: GearTierId): number {
  const found = GEAR_TIERS.find((t) => t.id === tier);
  if (!found) throw new Error(`Unknown tier: ${tier}`);
  return found.scraps;
}
```

`src/calculator/profit.ts`:

```ts
export type ProfitInput = {
  scrapPrice: number;
  scrapAmount: number;
  inclPrice: number;
  taxRate: number;
};

export type ProfitBreakdown = {
  dismantleValue: number;
  inclPrice: number;
  exclPrice: number;
  profit: number;
};

export function calculateProfit(input: ProfitInput): ProfitBreakdown {
  const dismantleValue = input.scrapPrice * input.scrapAmount;
  const exclPrice = input.inclPrice / (1 + input.taxRate);
  return {
    dismantleValue,
    inclPrice: input.inclPrice,
    exclPrice,
    profit: exclPrice - dismantleValue,
  };
}
```

`src/calculator/index.ts`:

```ts
export {
  GEAR_TIERS,
  scrapAmountForTier,
  type GearTier,
  type GearTierId,
} from "./tiers";
export { calculateProfit, type ProfitBreakdown, type ProfitInput } from "./profit";
```

Update `tsconfig.app.json` `"include"` to:

```json
"include": ["src/web", "src/calculator"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test src/calculator/profit.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/calculator tsconfig.app.json
git commit -m "$(cat <<'EOF'
feat: add pure gear profit calculator math

EOF
)"
```

---

### Task 2: Countries schema + migration seed

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0001_*.sql` and meta via `pnpm db:generate` (or `vp run db:generate`)
- Ensure migration SQL seeds Sweden

**Interfaces:**
- Consumes: existing Drizzle schema patterns
- Produces: `countries` table export from schema; migration applied on boot via existing `migrateDb`

- [ ] **Step 1: Add schema**

Append to `src/db/schema.ts`:

```ts
export const countries = sqliteTable("countries", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  taxRate: real("tax_rate").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

Import `real` from `drizzle-orm/sqlite-core` alongside existing imports.

- [ ] **Step 2: Generate migration**

Run (with `TURSO_DATABASE_URL` set, e.g. from `.env`):

```bash
pnpm db:generate
```

Expected: new `drizzle/0001_*.sql` creating `countries`.

- [ ] **Step 3: Add Sweden seed to the generated migration**

Append to the new SQL file (after `CREATE TABLE`):

```sql
--> statement-breakpoint
INSERT OR IGNORE INTO `countries` (`id`, `name`, `tax_rate`, `created_at`, `updated_at`)
VALUES ('sweden', 'Sweden', 0.01, cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000);
```

If drizzle-kit regenerates and wipes custom SQL, prefer a tiny boot-time seed helper instead:

Create `src/db/seed-countries.ts`:

```ts
import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { countries } from "./schema";

export async function seedDefaultCountries(db: Db): Promise<void> {
  const existing = await db.select().from(countries).where(eq(countries.id, "sweden")).limit(1);
  if (existing[0]) return;
  const now = new Date();
  await db.insert(countries).values({
    id: "sweden",
    name: "Sweden",
    taxRate: 0.01,
    createdAt: now,
    updatedAt: now,
  });
}
```

Call it from `src/server/index.ts` after `migrateDb(db)`.

Prefer **migration INSERT OR IGNORE** when the generated file is stable; use boot seed if migration customization is painful. Do not do both with conflicting assumptions — pick one and stick to it. Recommended: boot-time `seedDefaultCountries` (easier to keep in sync with schema, matches `syncJobsToDb` style).

- [ ] **Step 4: Smoke migrate**

Run against local file DB:

```bash
TURSO_DATABASE_URL=file:local.db pnpm db:migrate
```

Or start the server once and confirm no migration errors. Expected: `countries` exists with Sweden row.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/seed-countries.ts src/server/index.ts drizzle
git commit -m "$(cat <<'EOF'
feat: add countries table with Sweden tax seed

EOF
)"
```

---

### Task 3: Countries API

**Files:**
- Create: `src/server/routes/countries.ts`
- Create: `src/server/slug.ts` (or helpers colocated in countries route file)
- Create: `src/server/slug.test.ts`
- Modify: `src/server/app.ts` (mount `/api/countries` — can mount early with only `db` deps; full wire in Task 5 if preferred)

**Interfaces:**
- Consumes: `Db`, `countries` schema, `HttpError`
- Produces:
  - `export function slugifyCountryId(name: string): string`
  - `export function countriesRoutes(deps: { db: Db }): Hono`
  - `GET /` → `{ countries: CountryRow[] }`
  - `POST /` body `{ name: string, taxRate: number, id?: string }` → `{ country }`
  - `PATCH /:id` body `{ name?: string, taxRate?: number }` → `{ country }`
  - Validation: `taxRate` finite and in `[0, 1]`; duplicate id/name → 409; missing → 404

- [ ] **Step 1: Write failing slug + tax validation tests**

`src/server/slug.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { parseTaxRate, slugifyCountryId } from "./slug";

describe("slugifyCountryId", () => {
  it("slugifies names", () => {
    expect(slugifyCountryId("Sweden")).toBe("sweden");
    expect(slugifyCountryId("United States")).toBe("united-states");
  });
});

describe("parseTaxRate", () => {
  it("accepts 0..1", () => {
    expect(parseTaxRate(0.01)).toBe(0.01);
  });
  it("rejects out of range", () => {
    expect(() => parseTaxRate(1.5)).toThrow();
    expect(() => parseTaxRate(-0.1)).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `vp test src/server/slug.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement slug helpers + countries routes**

`src/server/slug.ts`:

```ts
import { HttpError } from "./errors";

export function slugifyCountryId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) {
    throw new HttpError(400, "invalid_body", "Country name must yield a non-empty id");
  }
  return slug;
}

export function parseTaxRate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new HttpError(400, "invalid_body", "taxRate must be a number between 0 and 1");
  }
  return value;
}
```

`src/server/routes/countries.ts` — implement list/create/patch using helpers above:

- Create: `id = body.id ?? slugifyCountryId(body.name)`; require non-empty `name` string
- On unique constraint / existing row conflict → `HttpError(409, "conflict", ...)`
- Patch: load by id; 404 if missing; update provided fields; set `updatedAt = new Date()`
- Return drizzle row as JSON (`taxRate` camelCase)

- [ ] **Step 4: Run slug tests**

Run: `vp test src/server/slug.test.ts`

Expected: PASS

- [ ] **Step 5: Mount route in `createApp`**

In `src/server/app.ts`:

```ts
app.route("/api/countries", countriesRoutes({ db: deps.db }));
```

- [ ] **Step 6: Manual smoke (optional but recommended)**

With server running and DB migrated:

```bash
curl -s http://127.0.0.1:8787/api/countries
curl -s -X POST http://127.0.0.1:8787/api/countries \
  -H 'content-type: application/json' \
  -d '{"name":"Norway","taxRate":0.02}'
```

Expected: Sweden listed; Norway created.

- [ ] **Step 7: Commit**

```bash
git add src/server/slug.ts src/server/slug.test.ts src/server/routes/countries.ts src/server/app.ts
git commit -m "$(cat <<'EOF'
feat: add countries CRUD API

EOF
)"
```

---

### Task 4: Scrap price fetch + cache API

**Files:**
- Modify: `src/db/cache.ts` — add `getCachedRow`
- Modify: `src/db/cache.test.ts` — only if testing pure helpers; row helper may be covered via scraps tests
- Create: `src/warera/prices.ts`
- Create: `src/warera/prices.test.ts`
- Create: `src/server/routes/scraps.ts`
- Create: `src/server/routes/scraps.test.ts` (test `resolveScrapPrice` logic with fakes)
- Modify: `src/warera/index.ts` — export prices helper if useful

**Interfaces:**
- Consumes: `Db`, Warera `request()`, `getOrFetch` / `setCached` / `getCachedRow`
- Produces:
  - `export const SCRAPS_CACHE_KEY = "warera:scraps:price"`
  - `export const SCRAPS_CACHE_TTL_SECONDS = 86400`
  - `export type ScrapPricePayload = { price: number; fetchedAt: string }`
  - `export type ScrapPriceResponse = ScrapPricePayload & { stale?: boolean }`
  - `export function parseScrapsPrice(trpcJson: unknown): number`
  - `export async function fetchScrapsPrice(warera: { request: <T>(path: string) => Promise<T> }): Promise<number>`
  - `export async function getScrapPrice(db, warera, opts?: { force?: boolean }): Promise<ScrapPriceResponse>`
  - Routes: `GET /api/scraps`, `POST /api/scraps/refresh`

- [ ] **Step 1: Write failing parse tests**

`src/warera/prices.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { parseScrapsPrice } from "./prices";

describe("parseScrapsPrice", () => {
  it("reads result.data.scraps", () => {
    expect(parseScrapsPrice({ result: { data: { scraps: 0.215 } } })).toBe(0.215);
  });
  it("throws when missing", () => {
    expect(() => parseScrapsPrice({ result: { data: {} } })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `vp test src/warera/prices.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement prices helper + getCachedRow + scraps service/route**

`getCachedRow` in `src/db/cache.ts`:

```ts
export async function getCachedRow<T>(
  db: Db,
  key: string,
): Promise<{ payload: T; fetchedAt: Date; ttlSeconds: number } | null> {
  const rows = await db.select().from(cache).where(eq(cache.key, key)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    payload: row.payload as T,
    fetchedAt: row.fetchedAt as Date,
    ttlSeconds: row.ttlSeconds,
  };
}
```

Refactor `getCached` to use `getCachedRow` + `isCacheFresh` (keep behavior identical).

`src/warera/prices.ts`:

```ts
export function parseScrapsPrice(trpcJson: unknown): number {
  const data = (trpcJson as { result?: { data?: { scraps?: unknown } } })?.result?.data;
  const price = data?.scraps;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    throw new Error("WarEra itemTrading.getPrices did not return a valid scraps price");
  }
  return price;
}

export async function fetchScrapsPrice(warera: {
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
}): Promise<number> {
  const json = await warera.request<unknown>("itemTrading.getPrices");
  return parseScrapsPrice(json);
}
```

`src/server/routes/scraps.ts` — core logic:

```ts
export const SCRAPS_CACHE_KEY = "warera:scraps:price";
export const SCRAPS_CACHE_TTL_SECONDS = 86400;

export type ScrapPricePayload = { price: number; fetchedAt: string };

export async function resolveScrapPrice(
  db: Db,
  warera: { request: <T>(path: string, init?: RequestInit) => Promise<T> },
  options: { force: boolean },
): Promise<ScrapPricePayload & { stale?: boolean }> {
  if (!options.force) {
    const fresh = await getCached<ScrapPricePayload>(db, SCRAPS_CACHE_KEY);
    if (fresh) return fresh;
  }

  try {
    const price = await fetchScrapsPrice(warera);
    const payload: ScrapPricePayload = { price, fetchedAt: new Date().toISOString() };
    await setCached(db, SCRAPS_CACHE_KEY, payload, SCRAPS_CACHE_TTL_SECONDS, "scraps");
    return payload;
  } catch (err) {
    const row = await getCachedRow<ScrapPricePayload>(db, SCRAPS_CACHE_KEY);
    if (row) {
      return { ...row.payload, stale: true };
    }
    throw new HttpError(
      502,
      "upstream_error",
      err instanceof Error ? err.message : "Failed to fetch scrap price",
    );
  }
}
```

Routes:

- `GET /` → `resolveScrapPrice(..., { force: false })`
- `POST /refresh` → `resolveScrapPrice(..., { force: true })`

Note: when `force: false` and cache miss/stale, `getCached` returns null then fetch runs. When fetch fails, `getCachedRow` still finds expired row for `stale: true`.

When `force: false` and cache is fresh, never hit WarEra.

Also export a unit test for `resolveScrapPrice` with fake `db`/`warera` if wiring real libSQL in tests is heavy — prefer testing `parseScrapsPrice` + a small in-memory fake for resolve if practical; minimum bar is `prices.test.ts` + manual smoke.

- [ ] **Step 4: Run prices tests**

Run: `vp test src/warera/prices.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/cache.ts src/db/cache.test.ts src/warera/prices.ts src/warera/prices.test.ts src/warera/index.ts src/server/routes/scraps.ts src/server/routes/scraps.test.ts
git commit -m "$(cat <<'EOF'
feat: add cached scrap price API from WarEra

EOF
)"
```

---

### Task 5: Wire WarEra client into app

**Files:**
- Modify: `src/server/app.ts`
- Modify: `src/server/index.ts`

**Interfaces:**
- Consumes: `createWareraClient` return type `{ request }`
- Produces: `CreateAppDeps` includes `warera: { request: ... }`; scraps routes mounted

- [ ] **Step 1: Extend deps and mount scraps**

In `src/server/app.ts`:

```ts
export type CreateAppDeps = {
  db: Db;
  logger: Logger;
  scheduler: SchedulerHandle;
  config: AppConfig;
  warera: { request: <T>(path: string, init?: RequestInit) => Promise<T> };
};

// ...
app.route("/api/countries", countriesRoutes({ db: deps.db }));
app.route("/api/scraps", scrapsRoutes({ db: deps.db, warera: deps.warera }));
```

In `src/server/index.ts`:

```ts
const warera = createWareraClient({ config, logger });
const app = createApp({ db, logger, scheduler, config, warera });
```

Remove the unused standalone `createWareraClient(...)` call that discarded the return value.

- [ ] **Step 2: Typecheck**

Run: `vp check`

Expected: pass (or only pre-existing issues unrelated to this change)

- [ ] **Step 3: Smoke scraps endpoint**

With `WARERA_API_KEY` configured if using gateway:

```bash
curl -s http://127.0.0.1:8787/api/scraps
curl -s -X POST http://127.0.0.1:8787/api/scraps/refresh
```

Expected: JSON `{ price: number, fetchedAt: string }` (second call refreshes).

- [ ] **Step 4: Commit**

```bash
git add src/server/app.ts src/server/index.ts
git commit -m "$(cat <<'EOF'
feat: wire WarEra client into scraps routes

EOF
)"
```

---

### Task 6: Calculator WebUI tab

**Files:**
- Modify: `src/web/layout/Shell.tsx`
- Modify: `src/web/App.tsx`
- Create: `src/web/features/calculator/types.ts`
- Create: `src/web/features/calculator/CalculatorPage.tsx`
- Modify: `src/web/index.css` (breakdown + profit highlight)

**Interfaces:**
- Consumes: `api()`, `GEAR_TIERS`, `calculateProfit`, `scrapAmountForTier`, `/api/scraps`, `/api/countries`
- Produces: Calculator tab UI

- [ ] **Step 1: Extend shell tabs for Calculator only**

In `Shell.tsx`, change `TabId` to:

```ts
export type TabId = "dashboard" | "jobs" | "calculator";
```

Add nav entry `{ id: "calculator", label: "Calculator" }`. (Countries tab is added in Task 7.)

- [ ] **Step 2: Implement CalculatorPage**

Behavior:

1. On mount / when tab active: `GET /api/scraps` and `GET /api/countries`
2. State: `tier` (default `"green"`), `countryId` (default `"sweden"` if present else first), `inclPrice` string input
3. Derive `taxRate` from selected country; `scrapAmount` from tier; `dismantleValue = scrapPrice * scrapAmount` even without incl
4. If `inclPrice` parses to finite `> 0`, call `calculateProfit` and show excl + profit
5. Primary breakdown: dismantle · incl · excl · profit (profit green/red)
6. Secondary details (details/summary or muted paragraph): scrap amount, raw scrap price, tax %, fetchedAt, stale warning if `stale`
7. Button “Refresh scrap price” → `POST /api/scraps/refresh`

Import math from `@/calculator` or relative `../../../calculator` — prefer `@/calculator` if Vite alias works from web (alias `@` → `src`).

`types.ts`:

```ts
export type Country = {
  id: string;
  name: string;
  taxRate: number;
};

export type CountriesResponse = { countries: Country[] };

export type ScrapsResponse = {
  price: number;
  fetchedAt: string;
  stale?: boolean;
};
```

Wire `App.tsx` with conditional render so inactive tabs unmount (ensures Calculator refetches countries when revisited after Task 7):

```tsx
{tab === "dashboard" ? (
  <DashboardPage />
) : tab === "jobs" ? (
  <JobsPage />
) : (
  <CalculatorPage />
)}
```

- [ ] **Step 3: Add minimal CSS**

Reuse existing `.page`, `.muted`, tables/buttons. Add:

```css
.calc-breakdown {
  display: grid;
  gap: 0.35rem;
  margin: 1rem 0;
  max-width: 28rem;
}
.calc-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}
.profit-positive { color: #15803d; font-weight: 600; }
.profit-negative { color: var(--error); font-weight: 600; }
```

- [ ] **Step 4: Manual UI check**

Run: `vp run dev` → open Calculator → select Green, country Sweden, incl `3.9` → expect small negative profit vs scrap ~0.215.

- [ ] **Step 5: Commit**

```bash
git add src/web/layout/Shell.tsx src/web/App.tsx src/web/features/calculator src/web/index.css
git commit -m "$(cat <<'EOF'
feat: add Calculator tab for gear vs scrap profit

EOF
)"
```

---

### Task 7: Countries WebUI tab

**Files:**
- Create: `src/web/features/countries/types.ts` (can re-export Country type or duplicate minimal shape)
- Create: `src/web/features/countries/CountriesPage.tsx`
- Modify: `src/web/App.tsx` (render CountriesPage)
- Modify: `src/web/index.css` if forms need spacing

**Interfaces:**
- Consumes: `/api/countries` GET/POST/PATCH; `api()`
- Produces: list + add + edit (tax as percent in inputs)

- [ ] **Step 1: Add Countries tab to shell**

Extend `TabId` with `"countries"` and nav `{ id: "countries", label: "Countries" }`.

- [ ] **Step 2: Implement CountriesPage**

- Load countries on mount
- Table: Name | Tax % | Edit
- Add form: name text, tax percent number (default `1`), submit → `POST` with `taxRate: percent / 100`
- Edit: inline or small form — PATCH `{ name?, taxRate }` converting percent → fraction
- Show API errors with existing error pattern from JobsPage
- No delete button

- [ ] **Step 3: Wire App.tsx**

```tsx
{tab === "dashboard" ? (
  <DashboardPage />
) : tab === "jobs" ? (
  <JobsPage />
) : tab === "calculator" ? (
  <CalculatorPage />
) : (
  <CountriesPage />
)}
```

Inactive tabs unmount, so Calculator refetches `/api/countries` whenever opened.

- [ ] **Step 4: Manual check**

Add a country, edit tax, switch to Calculator → new country in dropdown with correct tax.

- [ ] **Step 5: Commit**

```bash
git add src/web/layout/Shell.tsx src/web/features/countries src/web/App.tsx src/web/index.css
git commit -m "$(cat <<'EOF'
feat: add Countries admin tab for tax rates

EOF
)"
```

---

### Task 8: Final verification

**Files:**
- Modify: `README.md` — short note under Dev/WebUI about Calculator + Countries (optional one paragraph)

- [ ] **Step 1: Run full checks**

```bash
vp check
vp test
```

Expected: all pass.

- [ ] **Step 2: Update README briefly**

Under Dev or a new “WebUI” bullet: mention Calculator (gear vs scrap) and Countries (tax rates); scrap price cached 24h from WarEra `itemTrading.getPrices`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: mention gear calculator and countries tabs

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Pure formulas + hard-coded tiers | Task 1 |
| Worked example test | Task 1 |
| `countries` table + Sweden default | Task 2 |
| Countries list/create/patch API | Task 3 |
| No delete | Task 3 / 7 |
| Scrap cache 24h + refresh | Task 4 |
| Stale fallback on fetch failure | Task 4 |
| `itemTrading.getPrices` → `scraps` | Task 4 |
| Wire WarEra client into app | Task 5 |
| Calculator tab UI + breakdown | Task 6 |
| Secondary scrap details | Task 6 |
| Countries tab admin UI | Task 7 |
| Tax % UI ↔ fraction API | Task 7 |
| `vp check` / `vp test` | Task 8 |

## Out of scope (do not implement)

- Break-even listing price
- Market offer browsing / auto price lookup
- Country delete
- Inline tax override without DB
- `POST /api/calculator`
