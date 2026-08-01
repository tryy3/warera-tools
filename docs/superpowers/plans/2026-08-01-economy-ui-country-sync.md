# Economy UI Enrichment & Country Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the Economy tab with WarEra item icons, country flags, and gold-coin headlines; round formula/display numbers to ≤4 decimals; sync countries daily from WarEra into the existing `countries` table with API-owned fields read-only in the Countries tab.

**Architecture:** A daily `country-sync` job upserts `country.getAllCountries` into `countries` (WarEra `_id` as PK, `taxes.market/100` as `taxRate`). Advisor region lookup returns `countryCode` for flag URLs. Shared web media helpers (`ItemIcon`, `FlagIcon`, `GoldIcon`) plus `formatDisplayNumber` / formula rounding keep presentation tidy without changing economy math.

**Tech Stack:** TypeScript, React, Hono, Drizzle/Turso, existing job runner, Vitest via `vp test`, Vite+ (`vp check`).

**Design:** [2026-08-01-economy-ui-country-sync-design.md](../specs/2026-08-01-economy-ui-country-sync-design.md)

## Global Constraints

- Follow the design spec above; YAGNI on income/selfWork taxes and Countries tab removal
- Gold coin only on headline gold amounts (not formula boxes)
- Display rounding: standard round, max 4 fraction digits; math stays full precision
- Tax from WarEra is **market** tax: `taxes.market / 100`
- Flag URL: `https://media.warera.io/images/flags/{code}.svg?v=16` (lowercase code)
- Item URL: `https://media.warera.io/images/items/{itemCode}.png?v=33`
- WarEra-synced country fields (`name`, `isoCode`, `taxRate`) are not PATCH-able
- Prefer `vp test` / `vp check` for verification
- Commit after each task

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/economy/format.ts` | `formatDisplayNumber` for formula/UI strings |
| `src/economy/format.test.ts` | Rounding tests |
| `src/economy/profit.ts` | Use `formatDisplayNumber` in formula strings |
| `src/db/schema.ts` | `countries.source`, `countries.syncedAt` |
| `drizzle/0004_*.sql` (+ meta) | Migration for new columns + default `source` |
| `src/warera/countries.ts` | Parse `getAllCountries` → sync rows |
| `src/warera/countries.test.ts` | Parse / tax mapping tests |
| `src/db/country-sync.ts` | Upsert + PK migration match by iso/name |
| `src/db/country-sync.test.ts` | Migration/upsert tests (in-memory sqlite if pattern exists, else pure match helpers) |
| `src/jobs/country-sync/run.ts` | Job runner calling WarEra + upsert |
| `src/jobs/country-sync/index.ts` | Job definition (daily cron) |
| `src/jobs/registry.ts` | Register job |
| `src/db/seed-countries.ts` | Seed only when table empty |
| `src/server/routes/countries.ts` | POST `source=manual`; PATCH guards |
| `src/server/routes/countries.test.ts` | API-owned field rejection |
| `src/warera/companies.ts` | `fetchRegionInfo` returns name + countryCode |
| `src/economy/advisor.ts` | Expose region country codes on rows/switches |
| `src/web/features/economy/types.ts` | Type updates |
| `src/web/lib/wareraMedia.ts` | URL builders |
| `src/web/lib/wareraMedia.test.ts` | URL tests |
| `src/web/components/ItemIcon.tsx` | Item image |
| `src/web/components/FlagIcon.tsx` | Flag image |
| `src/web/components/GoldIcon.tsx` | Coin SVG |
| `src/web/features/economy/EconomyPage.tsx` | Icons + gold + format |
| `src/web/features/countries/*` | Read-only WarEra rows + flag images |
| `src/web/features/calculator/types.ts` | `source`, `syncedAt` on Country |
| `src/web/features/calculator/CalculatorPage.tsx` | Default country by `isoCode === 'SE'` |
| `src/web/index.css` | Icon row / gold inline styles |

---

### Task 1: Display number formatter

**Files:**
- Create: `src/economy/format.ts`
- Create: `src/economy/format.test.ts`
- Modify: `src/economy/index.ts` (re-export)

**Interfaces:**
- Consumes: nothing
- Produces: `export function formatDisplayNumber(value: number, maxFractionDigits = 4): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vite-plus/test";
import { formatDisplayNumber } from "./format";

describe("formatDisplayNumber", () => {
  it("rounds to at most 4 fraction digits", () => {
    expect(formatDisplayNumber(0.08560533885010638)).toBe("0.0856");
    expect(formatDisplayNumber(18.5524)).toBe("18.5524");
    expect(formatDisplayNumber(50.5, 1)).toBe("50.5");
  });

  it("uses fixed locale-independent decimal for formula strings", () => {
    // Implementation must not depend on process locale for formula embedding.
    expect(formatDisplayNumber(1234.5)).toMatch(/^1234\.5/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/economy/format.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

`src/economy/format.ts`:

```ts
/**
 * Format a number for human-facing labels and formula strings.
 * Uses standard rounding; maxFractionDigits capped at 4 by callers for economy UI.
 * Always uses `.` as decimal separator (not locale) so formulas stay stable in tests.
 */
export function formatDisplayNumber(value: number, maxFractionDigits = 4): string {
  if (!Number.isFinite(value)) return "—";
  const digits = Math.min(Math.max(0, maxFractionDigits), 20);
  // Trim trailing zeros after rounding
  return Number(value.toFixed(digits)).toString();
}
```

Re-export from `src/economy/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test src/economy/format.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/economy/format.ts src/economy/format.test.ts src/economy/index.ts
git commit -m "feat: add display number formatter for economy formulas"
```

---

### Task 2: Round formula strings in profit math

**Files:**
- Modify: `src/economy/profit.ts`
- Modify: `src/economy/profit.test.ts`
- Modify: `src/warera/companies.ts` (bonus `formula` string if it embeds floats — use formatter for `* 100` percents)

**Interfaces:**
- Consumes: `formatDisplayNumber` from `./format`
- Produces: unchanged function signatures; formula strings contain ≤4 decimals

- [ ] **Step 1: Extend failing/updated tests**

In `src/economy/profit.test.ts` add:

```ts
it("embeds rounded numbers in profit formula", () => {
  const result = calculateProfitPerPp("lead", { lead: 0.08560533885010638 });
  expect(result!.formula).toBe("(0.0856 G − 0 G raw) / 1 PP");
});

it("embeds rounded numbers in AE formula", () => {
  const explained = explainAeDaily(6, 0.505, 0.08560533885010638);
  expect(explained.formula).toContain("0.0856");
  expect(explained.formula).not.toContain("0.08560533885010638");
  // numeric outputs remain full precision
  expect(explained.dailyValue).toBeCloseTo(6 * 1.505 * 24 * 0.08560533885010638);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/economy/profit.test.ts`  
Expected: FAIL on new formula assertions

- [ ] **Step 3: Implement formula formatting**

In `profitForRecipe` success path:

```ts
formula: `(${formatDisplayNumber(marketPrice)} G − ${formatDisplayNumber(inputCost)} G raw) / ${recipe.consumedPp} PP`,
```

In `explainAeDaily`:

```ts
formula: `(${aeLevel} AE × (1 + ${formatDisplayNumber(bonusPct, 4)}% Bonus) × ${hoursPerDay}h) × ${formatDisplayNumber(profitPerPp)} G/PP`,
```

In `transferCostGold`:

```ts
formula:
  parts.length === 0
    ? "0 Concrete"
    : `(${parts.join(" + ")}) × ${formatDisplayNumber(concretePrice)} G Concrete`,
```

Also update `formatInputs` price labels with `formatDisplayNumber`.

In `fetchCompanyProductionBonus` formula (companies.ts), format each percent with `formatDisplayNumber(x * 100)` — import from `../economy/format` only if that does not create a server↔warera cycle; if cycle risk, duplicate a tiny local helper or move `formatDisplayNumber` to `src/lib/formatDisplayNumber.ts`. **Prefer** `src/lib/formatDisplayNumber.ts` if `warera` must not import `economy`.

If moving: update Task 1 files to `src/lib/formatDisplayNumber.ts` and re-export from economy — do that move in this task if needed before companies import.

- [ ] **Step 4: Run tests**

Run: `vp test src/economy/profit.test.ts src/economy/format.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/economy/profit.ts src/economy/profit.test.ts src/warera/companies.ts src/lib/formatDisplayNumber.ts src/economy/format.ts
git commit -m "feat: round economy formula display numbers to 4 decimals"
```

---

### Task 3: Countries schema + migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: migration via `vp run db:generate` or `npm run db:generate` → `drizzle/0004_*.sql`

**Interfaces:**
- Produces schema fields:
  - `source: text("source").notNull().default("manual")` — values `'warera' | 'manual'`
  - `syncedAt: integer("synced_at", { mode: "timestamp_ms" })` nullable

- [ ] **Step 1: Update schema**

```ts
export const countrySources = ["warera", "manual"] as const;
export type CountrySource = (typeof countrySources)[number];

export const countries = sqliteTable("countries", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  taxRate: real("tax_rate").notNull(),
  isoCode: text("iso_code"),
  source: text("source").notNull().default("manual"),
  syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

- [ ] **Step 2: Generate migration**

Run: `vp run db:generate` (or `npm run db:generate`)  
Expected: new `drizzle/0004_*.sql` with `ADD source` / `ADD synced_at`

Ensure SQL defaults existing rows to `'manual'`:

```sql
ALTER TABLE `countries` ADD `source` text DEFAULT 'manual' NOT NULL;
ALTER TABLE `countries` ADD `synced_at` integer;
```

- [ ] **Step 3: Apply migration locally**

Run: migrate CLI used by this repo (see `package.json` / `src/db/migrate-cli.ts`)  
Expected: success

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat: add countries source and syncedAt columns"
```

---

### Task 4: Parse WarEra countries

**Files:**
- Create: `src/warera/countries.ts`
- Create: `src/warera/countries.test.ts`

**Interfaces:**
- Consumes: `unwrapTrpcData`, `WareraRequester`, `wareraProcedurePath`
- Produces:
  - `export type WareraCountryRow = { id: string; name: string; isoCode: string; taxRate: number }`
  - `export function parseWareraCountries(trpcJson: unknown): WareraCountryRow[]`
  - `export async function fetchAllCountries(warera: WareraRequester): Promise<WareraCountryRow[]>`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vite-plus/test";
import { parseWareraCountries } from "./countries";

describe("parseWareraCountries", () => {
  it("maps code and market tax percent to fraction", () => {
    const rows = parseWareraCountries({
      result: {
        data: [
          {
            _id: "6813b6d446e731854c7ac7f2",
            name: "Sweden",
            code: "se",
            taxes: { income: 7, market: 1, selfWork: 1 },
          },
        ],
      },
    });
    expect(rows).toEqual([
      {
        id: "6813b6d446e731854c7ac7f2",
        name: "Sweden",
        isoCode: "SE",
        taxRate: 0.01,
      },
    ]);
  });

  it("skips entries missing id/name/code", () => {
    expect(
      parseWareraCountries({
        result: { data: [{ name: "X", taxes: { market: 1 } }] },
      }),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `vp test src/warera/countries.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement**

Parse array from tRPC data; `isoCode = code.trim().toUpperCase()`; `taxRate = taxes.market / 100` when finite; skip invalid.

```ts
export async function fetchAllCountries(warera: WareraRequester): Promise<WareraCountryRow[]> {
  const json = await warera.request<unknown>(wareraProcedurePath("country.getAllCountries"));
  return parseWareraCountries(json);
}
```

- [ ] **Step 4: Run to pass**

Run: `vp test src/warera/countries.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/warera/countries.ts src/warera/countries.test.ts
git commit -m "feat: parse WarEra country.getAllCountries for sync"
```

---

### Task 5: Country sync upsert + seed change

**Files:**
- Create: `src/db/country-sync.ts`
- Create: `src/db/country-sync.test.ts`
- Modify: `src/db/seed-countries.ts`

**Interfaces:**
- Consumes: `WareraCountryRow[]`, `Db`, `countries` schema
- Produces:
  - `export type CountrySyncResult = { total: number; inserted: number; updated: number; migrated: number }`
  - `export async function syncCountriesFromWarera(db: Db, rows: WareraCountryRow[], now?: Date): Promise<CountrySyncResult>`

**Upsert rules (exact):**
1. Load all local countries.
2. For each Warera row:
   - If local row with `id === warera.id` exists → update name, isoCode, taxRate, source=`warera`, syncedAt=now.
   - Else find local match where `isoCode` equals (case-insensitive) OR `name` equals exactly.
     - If match and match.id !== warera.id: **migrate PK** — in a transaction: insert new row with warera id + fields; delete old row; count as `migrated` (+ `updated`).
     - If no match: insert new warera row; `inserted++`.
3. Do not delete unmatched local manual rows.

- [ ] **Step 1: Write failing tests**

Use the same in-memory sqlite approach as `src/server/routes/countries.test.ts` (create table with new columns). Cover:
- Insert when empty
- Update when id matches
- Migrate `sweden` + `isoCode SE` → WarEra Sweden id
- Leave unrelated manual row untouched

- [ ] **Step 2: Run to fail**

Run: `vp test src/db/country-sync.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement sync + seed**

`seedDefaultCountries`: if `select count(*) from countries` is 0, insert nothing (sync will populate) **or** insert Sweden only when empty **and** document that first `country-sync` run replaces it. Spec preference: **seed only when table empty** — insert Sweden with `source='manual'` as bootstrap **or** skip seed entirely and rely on job. **Choose: seed only when empty with Sweden bootstrap (`source=manual`, `isoCode=SE`) so calculator works before first sync; sync migrates it.**

```ts
export async function seedDefaultCountries(db: Db): Promise<void> {
  const any = await db.select({ id: countries.id }).from(countries).limit(1);
  if (any[0]) return;
  const now = new Date();
  await db.insert(countries).values({
    id: "sweden",
    name: "Sweden",
    taxRate: 0.01,
    isoCode: "SE",
    source: "manual",
    syncedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}
```

- [ ] **Step 4: Run tests**

Run: `vp test src/db/country-sync.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/country-sync.ts src/db/country-sync.test.ts src/db/seed-countries.ts
git commit -m "feat: upsert WarEra countries with PK migration by ISO"
```

---

### Task 6: Register `country-sync` job

**Files:**
- Create: `src/jobs/country-sync/run.ts`
- Create: `src/jobs/country-sync/index.ts`
- Modify: `src/jobs/registry.ts`

**Interfaces:**
- Consumes: `fetchAllCountries`, `syncCountriesFromWarera`
- Produces: job id `country-sync`, defaultCron `0 0 0 * * *`, defaultEnabled `true`

- [ ] **Step 1: Implement run + definition**

`run.ts`:

```ts
export async function runCountrySync(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
}): Promise<CountrySyncResult> {
  const rows = await fetchAllCountries(options.warera);
  const result = await syncCountriesFromWarera(options.db, rows);
  options.logger.info(result, "country sync complete");
  return result;
}
```

`index.ts`: mirror `price-poll/index.ts`; return message  
`synced ${total} (inserted ${inserted}, updated ${updated}, migrated ${migrated})`.

Register in `listJobDefinitions()`.

- [ ] **Step 2: Typecheck / smoke**

Run: `vp check` (or at least `vp test` for related + tsc if check is heavy)  
Expected: no errors from new job wiring

- [ ] **Step 3: Commit**

```bash
git add src/jobs/country-sync/ src/jobs/registry.ts
git commit -m "feat: add daily country-sync job"
```

---

### Task 7: Countries API guards + types

**Files:**
- Modify: `src/server/routes/countries.ts`
- Modify: `src/server/routes/countries.test.ts`
- Modify: `src/web/features/calculator/types.ts`

**Interfaces:**
- POST always sets `source: "manual"`, `syncedAt: null`
- PATCH: if `existing.source === "warera"` and body includes `name` | `taxRate` | `isoCode`, throw `HttpError(400, "api_owned_field", "Cannot overwrite WarEra-synced country fields")`

- [ ] **Step 1: Write failing route tests**

Seed a warera country; PATCH tax → expect 400; PATCH manual country tax → 200.

- [ ] **Step 2: Run to fail**

Run: `vp test src/server/routes/countries.test.ts`  
Expected: FAIL on new cases

- [ ] **Step 3: Implement guards + POST source**

Update `Country` type:

```ts
export type Country = {
  id: string;
  name: string;
  taxRate: number;
  isoCode: string | null;
  source: "warera" | "manual";
  syncedAt: string | null; // ISO string if API serializes Date — match actual JSON (Date may become string via JSON). Prefer returning syncedAt as ISO string from route mapper OR leave as Date and let JSON stringify — be consistent with other timestamps in this API.
};
```

If GET currently returns Date objects that JSON.stringify to ISO, keep that; update frontend type to `string | null` if that's what fetch receives.

- [ ] **Step 4: Run tests**

Run: `vp test src/server/routes/countries.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/countries.ts src/server/routes/countries.test.ts src/web/features/calculator/types.ts
git commit -m "feat: lock WarEra-synced country fields on PATCH"
```

---

### Task 8: Region countryCode in advisor

**Files:**
- Modify: `src/warera/companies.ts` (`fetchRegionName` → `fetchRegionInfo`)
- Modify: `src/warera/companies.test.ts` (if region parse tests exist; add)
- Modify: `src/economy/advisor.ts`
- Modify: `src/web/features/economy/types.ts`

**Interfaces:**
- Produces:
  - `export type RegionInfo = { name: string | null; countryCode: string | null }`
  - `export async function fetchRegionInfo(warera, regionId): Promise<RegionInfo>`
  - Keep `fetchRegionName` as thin wrapper calling `fetchRegionInfo` then `.name` **or** replace call sites
  - Company row adds `regionCountryCode: string | null`
  - `SwitchRecommendation` adds `bestRegionCountryCode: string | null`

- [ ] **Step 1: Tests for parsing region payload**

```ts
it("reads countryCode from region.getById shape", () => {
  // unit-test a parseRegionInfo(data) helper
  expect(
    parseRegionInfo({
      name: "Turkistan",
      countryCode: "kz",
      country: "6813…",
    }),
  ).toEqual({ name: "Turkistan", countryCode: "kz" });
});
```

- [ ] **Step 2: Implement parse + advisor wiring**

Cache `Map<string, RegionInfo>` instead of name-only. When enriching companies and when resolving best switch region name, also set country codes (fetch info for `bestRegionId` if needed).

- [ ] **Step 3: Run tests**

Run: `vp test src/warera/companies.test.ts`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/warera/companies.ts src/warera/companies.test.ts src/economy/advisor.ts src/web/features/economy/types.ts
git commit -m "feat: expose region country codes on economy advisor"
```

---

### Task 9: Web media helpers + icons

**Files:**
- Create: `src/web/lib/wareraMedia.ts`
- Create: `src/web/lib/wareraMedia.test.ts`
- Create: `src/web/components/ItemIcon.tsx`
- Create: `src/web/components/FlagIcon.tsx`
- Create: `src/web/components/GoldIcon.tsx`
- Modify: `src/web/index.css` (`.item-icon`, `.flag-icon`, `.gold-icon`, `.icon-label`)

**Interfaces:**
- `wareraItemUrl(itemCode: string): string`
- `wareraFlagUrl(isoOrCountryCode: string): string` — lowercases
- Components take `code` / `itemCode` and optional `className`; FlagIcon returns `null` if no code

**GoldIcon SVG** (exact path from design):

```tsx
export function GoldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "gold-icon"}
      stroke="currentColor"
      fill="currentColor"
      strokeWidth="0"
      viewBox="0 0 24 24"
      height="1em"
      width="1em"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 5C7.031 5 2 6.546 2 9.5S7.031 14 12 14c4.97 0 10-1.546 10-4.5S16.97 5 12 5zm-5 9.938v3c1.237.299 2.605.482 4 .541v-3a21.166 21.166 0 0 1-4-.541zm6 .54v3a20.994 20.994 0 0 0 4-.541v-3a20.994 20.994 0 0 1-4 .541zm6-1.181v3c1.801-.755 3-1.857 3-3.297v-3c0 1.44-1.199 2.542-3 3.297zm-14 3v-3C3.2 13.542 2 12.439 2 11v3c0 1.439 1.2 2.542 3 3.297z" />
    </svg>
  );
}
```

CSS: `filter: drop-shadow(black 1px 1px 0px); font-size: 120%;` on `.gold-icon`.

- [ ] **Step 1: URL tests + implement helpers/components**

```ts
expect(wareraItemUrl("cocain")).toBe("https://media.warera.io/images/items/cocain.png?v=33");
expect(wareraFlagUrl("SE")).toBe("https://media.warera.io/images/flags/se.svg?v=16");
```

- [ ] **Step 2: Run tests**

Run: `vp test src/web/lib/wareraMedia.test.ts`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/web/lib/wareraMedia.ts src/web/lib/wareraMedia.test.ts src/web/components/ItemIcon.tsx src/web/components/FlagIcon.tsx src/web/components/GoldIcon.tsx src/web/index.css
git commit -m "feat: add WarEra item, flag, and gold icon components"
```

---

### Task 10: Economy page enrichment

**Files:**
- Modify: `src/web/features/economy/EconomyPage.tsx`
- Modify: `src/web/index.css` (if needed)

**Interfaces:**
- Consumes: icons, `formatDisplayNumber` (from `@/lib/formatDisplayNumber` or economy — SPA may need path alias; if SPA cannot import `src/lib`, duplicate thin `formatNum` using same rules in `src/web/lib/formatDisplayNumber.ts` that mirrors server helper, **or** ensure `tsconfig.app.json` includes `src/lib`). Prefer one shared `src/lib/formatDisplayNumber.ts` included in app tsconfig.

- [ ] **Step 1: Wire UI**

- Material `dd`: `<ItemIcon itemCode={…} />` + label
- Region `dd`: `<FlagIcon code={row.company.regionCountryCode} />` + name
- Pill / Profit/PP / transfer gold / opportunities G/PP: wrap with `<GoldIcon />` + `formatDisplayNumber` / existing `formatNum` capped at 4
- Best switch: item icon + flag for best region
- Opportunity table Item column: icon + name
- Do **not** put GoldIcon inside `FormulaBox`

Also add `regionCountryCode` to company type usage (from Task 8).

- [ ] **Step 2: Visual smoke**

Run: `vp check`  
Manual: open Economy tab with a known user — icons/flags/coins visible; formulas ≤4 decimals.

- [ ] **Step 3: Commit**

```bash
git add src/web/features/economy/EconomyPage.tsx src/web/index.css tsconfig.app.json src/web/lib/formatDisplayNumber.ts
git commit -m "feat: enrich Economy tab with icons, flags, and gold"
```

---

### Task 11: Countries tab read-only + calculator default SE

**Files:**
- Modify: `src/web/features/countries/CountriesPage.tsx`
- Modify: `src/web/features/calculator/CalculatorPage.tsx`
- Modify: `src/web/features/calculator/CountrySelect.tsx` (optional: keep emoji)

**Interfaces:**
- WarEra rows: no Edit button for name/tax/iso (or Edit disabled / hidden); show `<FlagIcon code={isoCode} />`
- Manual rows: keep edit
- Add form remains for manual countries
- `defaultCountryId`: `countries.find(c => c.isoCode === "SE")?.id ?? countries[0]?.id`

- [ ] **Step 1: Implement UI + calculator default**

Replace `countries.some((c) => c.id === "sweden")` logic with isoCode SE.

- [ ] **Step 2: Run check**

Run: `vp check`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/web/features/countries/CountriesPage.tsx src/web/features/calculator/CalculatorPage.tsx
git commit -m "feat: read-only WarEra countries and default SE by ISO"
```

---

### Task 12: Final verification

- [ ] **Step 1: Full test + check**

Run: `vp test && vp check`  
Expected: all green

- [ ] **Step 2: Manual checklist**

- Run `country-sync` from Jobs UI (or wait for schedule)
- Countries tab lists many countries; Sweden tax matches API market %; fields not editable for WarEra rows
- Calculator defaults to Sweden; tax from synced rate
- Economy: Turkistan shows KZ flag; items show icons; gold on headlines; formulas short decimals

- [ ] **Step 3: Commit only if verification fixed files**

```bash
git status
# commit any leftover fixes
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Display round ≤4 decimals | 1–2, 10 |
| Formula rounding, math full precision | 2 |
| Item icons media URL | 9–10 |
| Flag media URL + region countryCode | 8–10 |
| Gold coin headlines only | 9–10 |
| Merge into `countries` + source/syncedAt | 3–5 |
| Daily country-sync job | 6 |
| Tax from `taxes.market` | 4–5 |
| PATCH lock API fields | 7 |
| Countries tab read-only + flag images | 11 |
| Seed does not fight sync | 5 |
| Calculator default by SE iso | 11 |
| No income/selfWork / no tab removal | Out of scope — no tasks |

## Placeholder / consistency notes

- If `src/economy` ↔ `src/warera` import cycle appears, keep `formatDisplayNumber` in `src/lib/formatDisplayNumber.ts` (Task 2).
- SPA must import shared formatter via `tsconfig.app.json` include of `src/lib`.
- `syncedAt` JSON shape: match existing Date serialization used by countries GET.
