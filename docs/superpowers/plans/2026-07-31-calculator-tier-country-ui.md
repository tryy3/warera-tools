# Calculator Tier & Country UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Calculator tier/country `<select>`s with gradient gear tiles and a flagged custom country dropdown, backed by an optional `isoCode` on countries.

**Architecture:** Add nullable `iso_code` via Drizzle migration + seed backfill. Server validates ISO via a pure `parseIsoCode` helper. WebUI adds `flagEmojiFromIso`, `TierPicker`, and `CountrySelect`, wired into Calculator; Countries admin gains an optional ISO field. Calc math and scraps API stay unchanged.

**Tech Stack:** TypeScript, React, Hono, Drizzle/SQLite (Turso), Vitest via `vp test`, Vite+ (`vp check` / `vp run db:generate`).

## Global Constraints

- Follow design spec: `docs/superpowers/specs/2026-07-31-calculator-tier-country-ui-design.md`
- ISO codes: optional; normalize to uppercase; `/^[A-Z]{2}$/` or null; empty string → null
- JSON field name `isoCode` (camelCase), matching `taxRate`
- Chest image URL exactly: `https://media.warera.io/images/items/chest.png?v=33`
- Tier order remains `GEAR_TIERS` order (gray → red)
- Made-up CSS gradients only — no official WarEra palette required
- No new npm dependencies for dropdown/flags
- Prefer `vp test` / `vp check` for verification
- Do not rewrite unrelated local diffs in `JobsPage.tsx` / existing `CountriesPage.tsx` action-cell markup unless required for the ISO column

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/server/iso.ts` | `parseIsoCode` pure helper |
| `src/server/iso.test.ts` | Unit tests for ISO parsing |
| `src/db/schema.ts` | Add `isoCode` column |
| `drizzle/0002_*.sql` (+ meta) | `ALTER TABLE … ADD iso_code` |
| `src/db/seed-countries.ts` | Insert/backfill Sweden `SE` |
| `src/server/routes/countries.ts` | Accept/return `isoCode` on POST/PATCH |
| `src/server/routes/countries.test.ts` | Memory schema + route cases for `isoCode` |
| `src/web/lib/flagEmoji.ts` | ISO → regional-indicator emoji |
| `src/web/lib/flagEmoji.test.ts` | Unit tests for emoji helper |
| `src/web/features/calculator/types.ts` | `Country.isoCode` |
| `src/web/features/calculator/TierPicker.tsx` | Gradient tile radiogroup |
| `src/web/features/calculator/CountrySelect.tsx` | Custom flagged dropdown |
| `src/web/features/calculator/CalculatorPage.tsx` | Wire new controls |
| `src/web/features/countries/CountriesPage.tsx` | ISO field in table + forms |
| `src/web/index.css` | Tier tile + country dropdown styles |

---

### Task 1: `parseIsoCode` helper

**Files:**
- Create: `src/server/iso.ts`
- Create: `src/server/iso.test.ts`

**Interfaces:**
- Consumes: `HttpError` from `src/server/errors.ts`
- Produces: `export function parseIsoCode(value: unknown): string | null`

- [ ] **Step 1: Write the failing test**

Create `src/server/iso.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { HttpError } from "./errors";
import { parseIsoCode } from "./iso";

describe("parseIsoCode", () => {
  it("returns null for null/undefined/empty", () => {
    expect(parseIsoCode(null)).toBeNull();
    expect(parseIsoCode(undefined)).toBeNull();
    expect(parseIsoCode("")).toBeNull();
    expect(parseIsoCode("  ")).toBeNull();
  });

  it("normalizes lowercase to uppercase", () => {
    expect(parseIsoCode("se")).toBe("SE");
    expect(parseIsoCode(" Se ")).toBe("SE");
  });

  it("rejects non-strings and invalid codes", () => {
    expect(() => parseIsoCode(12)).toThrow(HttpError);
    expect(() => parseIsoCode("SWE")).toThrow(HttpError);
    expect(() => parseIsoCode("S")).toThrow(HttpError);
    expect(() => parseIsoCode("S1")).toThrow(HttpError);
    try {
      parseIsoCode("SWE");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(400);
      expect((err as HttpError).code).toBe("invalid_body");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/server/iso.test.ts`

Expected: FAIL (cannot resolve `./iso`)

- [ ] **Step 3: Implement helper**

Create `src/server/iso.ts`:

```ts
import { HttpError } from "./errors";

export function parseIsoCode(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new HttpError(400, "invalid_body", "isoCode must be a 2-letter ISO country code or null");
  }
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const upper = trimmed.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) {
    throw new HttpError(400, "invalid_body", "isoCode must be a 2-letter ISO country code or null");
  }
  return upper;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test src/server/iso.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/iso.ts src/server/iso.test.ts
git commit -m "feat: add parseIsoCode helper for country flags"
```

---

### Task 2: Schema, migration, and Sweden seed

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/seed-countries.ts`
- Create: `drizzle/0002_*.sql` (+ meta via generate)

**Interfaces:**
- Consumes: existing `countries` table
- Produces: `countries.isoCode: string | null` mapped to column `iso_code`

- [ ] **Step 1: Add column to schema**

In `src/db/schema.ts`, update `countries`:

```ts
export const countries = sqliteTable("countries", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  taxRate: real("tax_rate").notNull(),
  isoCode: text("iso_code"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

- [ ] **Step 2: Generate migration**

Run: `vp run db:generate`

Expected: new `drizzle/0002_*.sql` containing `ALTER TABLE \`countries\` ADD \`iso_code\` text;` (wording may vary).

- [ ] **Step 3: Update seed to insert/backfill `SE`**

Replace `src/db/seed-countries.ts` with:

```ts
import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { countries } from "./schema";

export async function seedDefaultCountries(db: Db): Promise<void> {
  const existing = await db.select().from(countries).where(eq(countries.id, "sweden")).limit(1);
  const now = new Date();

  if (!existing[0]) {
    await db.insert(countries).values({
      id: "sweden",
      name: "Sweden",
      taxRate: 0.01,
      isoCode: "SE",
      createdAt: now,
      updatedAt: now,
    });
    return;
  }

  if (existing[0].isoCode == null) {
    await db
      .update(countries)
      .set({ isoCode: "SE", updatedAt: now })
      .where(eq(countries.id, "sweden"));
  }
}
```

- [ ] **Step 4: Smoke migrate**

Run (with project env / local file DB as you normally use):

```bash
vp run db:migrate
```

Expected: migrates successfully; no error on boot seed.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/seed-countries.ts drizzle
git commit -m "feat: add countries.iso_code and seed Sweden SE"
```

---

### Task 3: Countries API accepts `isoCode`

**Files:**
- Modify: `src/server/routes/countries.ts`
- Modify: `src/server/routes/countries.test.ts`

**Interfaces:**
- Consumes: `parseIsoCode` from `src/server/iso.ts`
- Produces: POST/PATCH request/response bodies include optional `isoCode: string | null`

- [ ] **Step 1: Update memory DB + failing route tests**

In `src/server/routes/countries.test.ts`:

1. Add `iso_code TEXT` to the `CREATE TABLE countries` SQL.
2. Extend `seedCountry` to accept optional `isoCode?: string | null` and pass it into insert.
3. Add tests:

```ts
  it("POST accepts isoCode and returns it uppercase", async () => {
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Norway", taxRate: 0.02, isoCode: "no" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { country: { isoCode: string | null; name: string } };
    expect(body.country.name).toBe("Norway");
    expect(body.country.isoCode).toBe("NO");
  });

  it("POST rejects invalid isoCode", async () => {
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Norway", taxRate: 0.02, isoCode: "NOR" }),
    });
    expect(res.status).toBe(400);
  });

  it("PATCH can set and clear isoCode", async () => {
    const setRes = await app.request("/sweden", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isoCode: "se" }),
    });
    expect(setRes.status).toBe(200);
    expect(((await setRes.json()) as { country: { isoCode: string | null } }).country.isoCode).toBe(
      "SE",
    );

    const clearRes = await app.request("/sweden", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isoCode: null }),
    });
    expect(clearRes.status).toBe(200);
    expect(
      ((await clearRes.json()) as { country: { isoCode: string | null } }).country.isoCode,
    ).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/server/routes/countries.test.ts`

Expected: FAIL on new cases (isoCode ignored / not on row)

- [ ] **Step 3: Wire `isoCode` into POST/PATCH**

In `src/server/routes/countries.ts`:

1. `import { parseIsoCode } from "../iso";`
2. On POST, after parsing `name` / `taxRate` / `id`:

```ts
    const isoCode =
      body.isoCode === undefined ? null : parseIsoCode(body.isoCode);

    // insert values include isoCode
    await db.insert(countries).values({
      id,
      name: trimmedName,
      taxRate,
      isoCode,
      createdAt: now,
      updatedAt: now,
    });
```

3. On PATCH, change patch type and empty-check:

```ts
    const patch: {
      name?: string;
      taxRate?: number;
      isoCode?: string | null;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    // ... existing name / taxRate handling ...

    if (body.isoCode !== undefined) {
      patch.isoCode = parseIsoCode(body.isoCode);
    }

    if (patch.name === undefined && patch.taxRate === undefined && patch.isoCode === undefined) {
      return c.json({ country: existing[0] });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/server/routes/countries.test.ts src/server/iso.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/countries.ts src/server/routes/countries.test.ts
git commit -m "feat: accept isoCode on countries create and update"
```

---

### Task 4: Flag emoji helper

**Files:**
- Create: `src/web/lib/flagEmoji.ts`
- Create: `src/web/lib/flagEmoji.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `export function flagEmojiFromIso(isoCode: string | null | undefined): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vite-plus/test";
import { flagEmojiFromIso } from "./flagEmoji";

describe("flagEmojiFromIso", () => {
  it("returns empty for missing/invalid", () => {
    expect(flagEmojiFromIso(null)).toBe("");
    expect(flagEmojiFromIso(undefined)).toBe("");
    expect(flagEmojiFromIso("")).toBe("");
    expect(flagEmojiFromIso("S")).toBe("");
    expect(flagEmojiFromIso("SWE")).toBe("");
  });

  it("maps SE to Sweden flag", () => {
    expect(flagEmojiFromIso("SE")).toBe("🇸🇪");
    expect(flagEmojiFromIso("se")).toBe("🇸🇪");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/web/lib/flagEmoji.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement helper**

```ts
export function flagEmojiFromIso(isoCode: string | null | undefined): string {
  if (!isoCode) return "";
  const upper = isoCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  const A = 0x1f1e6;
  const chars = [...upper].map((ch) => String.fromCodePoint(A + (ch.charCodeAt(0) - 65)));
  return chars.join("");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test src/web/lib/flagEmoji.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/web/lib/flagEmoji.ts src/web/lib/flagEmoji.test.ts
git commit -m "feat: add ISO country code to flag emoji helper"
```

---

### Task 5: Countries admin ISO field

**Files:**
- Modify: `src/web/features/calculator/types.ts`
- Modify: `src/web/features/countries/CountriesPage.tsx`

**Interfaces:**
- Consumes: `Country.isoCode: string | null` from API; `flagEmojiFromIso`
- Produces: admin can create/update/clear ISO codes

- [ ] **Step 1: Extend shared `Country` type**

In `src/web/features/calculator/types.ts`:

```ts
export type Country = {
  id: string;
  name: string;
  taxRate: number;
  isoCode: string | null;
};
```

(`features/countries/types.ts` already re-exports this type.)

- [ ] **Step 2: Wire Countries admin UI**

Update `CountriesPage.tsx`:

1. Import `flagEmojiFromIso` from `../../lib/flagEmoji`.
2. State: `addIsoCode` (default `""`), `editIsoCode`.
3. `startEdit`: `setEditIsoCode(country.isoCode ?? "")`.
4. `cancelEdit`: clear `editIsoCode`.
5. `handleAdd` body: include `isoCode: addIsoCode.trim() === "" ? null : addIsoCode.trim()` (server normalizes/validates).
6. `saveEdit` body: include `isoCode: editIsoCode.trim() === "" ? null : editIsoCode.trim()`.
7. Table: add **ISO** column between Name and Tax % showing `flagEmojiFromIso(country.isoCode)` + code, or `—` when null; edit mode shows a short text input (`maxLength={2}`, placeholder `SE`, `aria-label="ISO country code"`).
8. Add form: optional ISO label/input after Tax %.

- [ ] **Step 3: Manual smoke (optional if server running)**

Create/edit a country with `SE` / clear ISO; confirm list shows 🇸🇪 / —.

- [ ] **Step 4: Commit**

```bash
git add src/web/features/calculator/types.ts src/web/features/countries/CountriesPage.tsx
git commit -m "feat: manage country ISO codes in Countries admin"
```

---

### Task 6: `TierPicker` + styles

**Files:**
- Create: `src/web/features/calculator/TierPicker.tsx`
- Modify: `src/web/index.css`

**Interfaces:**
- Consumes: `GEAR_TIERS`, `GearTierId` from `@/calculator`
- Produces: `<TierPicker value={GearTierId} onChange={(tier: GearTierId) => void} />`

- [ ] **Step 1: Implement component**

Create `src/web/features/calculator/TierPicker.tsx`:

```tsx
import { GEAR_TIERS, type GearTierId } from "@/calculator";

const CHEST_SRC = "https://media.warera.io/images/items/chest.png?v=33";

type Props = {
  value: GearTierId;
  onChange: (tier: GearTierId) => void;
};

export function TierPicker({ value, onChange }: Props) {
  return (
    <div className="tier-picker" role="radiogroup" aria-label="Gear tier">
      {GEAR_TIERS.map((tier) => {
        const selected = tier.id === value;
        return (
          <button
            key={tier.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={tier.label}
            className={`tier-tile tier-tile--${tier.id}${selected ? " is-selected" : ""}`}
            onClick={() => onChange(tier.id)}
          >
            <img className="tier-tile-icon" src={CHEST_SRC} alt="" draggable={false} />
            <span className="tier-tile-footer">{tier.scraps}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add CSS**

Append to `src/web/index.css`:

```css
.tier-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tier-tile {
  width: 4.75rem;
  height: 6.5rem;
  padding: 0.4rem 0.35rem 0.35rem;
  border: 2px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 0.25rem;
  cursor: pointer;
  color: #e5e7eb;
}

.tier-tile.is-selected {
  border-color: #38bdf8;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.35);
}

.tier-tile-icon {
  width: 78%;
  height: auto;
  object-fit: contain;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.45));
}

.tier-tile-footer {
  width: 100%;
  text-align: center;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  padding: 0.15rem 0;
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.38);
}

.tier-tile--gray {
  background: linear-gradient(160deg, #6b7280 0%, #374151 55%, #1f2937 100%);
}
.tier-tile--green {
  background: linear-gradient(160deg, #34d399 0%, #166534 50%, #052e16 100%);
}
.tier-tile--blue {
  background: linear-gradient(160deg, #60a5fa 0%, #1d4ed8 50%, #172554 100%);
}
.tier-tile--purple {
  background: linear-gradient(160deg, #c084fc 0%, #7e22ce 50%, #3b0764 100%);
}
.tier-tile--yellow {
  background: linear-gradient(160deg, #fbbf24 0%, #b45309 50%, #451a03 100%);
}
.tier-tile--red {
  background: linear-gradient(160deg, #f87171 0%, #b91c1c 50%, #450a0a 100%);
}
```

Also update `.calc-controls` so the tier label can span full width when desired:

```css
.calc-controls .calc-control-tier {
  flex: 1 1 100%;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/web/features/calculator/TierPicker.tsx src/web/index.css
git commit -m "feat: add gradient TierPicker for calculator"
```

---

### Task 7: `CountrySelect` + styles

**Files:**
- Create: `src/web/features/calculator/CountrySelect.tsx`
- Modify: `src/web/index.css`

**Interfaces:**
- Consumes: `Country` type; `flagEmojiFromIso`
- Produces: `<CountrySelect countries={Country[]} value={string} onChange={(id: string) => void} disabled?: boolean />`

- [ ] **Step 1: Implement component**

Create `src/web/features/calculator/CountrySelect.tsx`:

```tsx
import { useEffect, useId, useRef, useState } from "react";
import { flagEmojiFromIso } from "../../lib/flagEmoji";
import type { Country } from "./types";

type Props = {
  countries: Country[];
  value: string;
  onChange: (countryId: string) => void;
  disabled?: boolean;
};

function labelFor(country: Country): string {
  const flag = flagEmojiFromIso(country.isoCode);
  return flag ? `${flag} ${country.name}` : country.name;
}

export function CountrySelect({ countries, value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = countries.find((c) => c.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="country-select" ref={rootRef}>
      <button
        type="button"
        className="country-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled || countries.length === 0}
        onClick={() => setOpen((v) => !v)}
      >
        {selected ? labelFor(selected) : countries.length === 0 ? "No countries" : "Select country"}
      </button>
      {open ? (
        <ul id={listId} className="country-select-list" role="listbox">
          {countries.map((country) => {
            const isSelected = country.id === value;
            return (
              <li key={country.id} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  className={isSelected ? "is-selected" : undefined}
                  onClick={() => {
                    onChange(country.id);
                    setOpen(false);
                  }}
                >
                  {labelFor(country)}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Add CSS**

Append to `src/web/index.css`:

```css
.country-select {
  position: relative;
  min-width: 10rem;
}

.country-select-trigger {
  width: 100%;
  text-align: left;
  font: inherit;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.3rem 0.5rem;
  background: #fff;
}

.country-select-list {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 0.25rem;
  list-style: none;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
  max-height: 16rem;
  overflow: auto;
}

.country-select-list button {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  border-radius: 4px;
  padding: 0.4rem 0.5rem;
  font: inherit;
  color: var(--text);
}

.country-select-list button:hover,
.country-select-list button.is-selected {
  background: var(--accent-soft);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/web/features/calculator/CountrySelect.tsx src/web/index.css
git commit -m "feat: add flagged CountrySelect dropdown"
```

---

### Task 8: Wire CalculatorPage + verify

**Files:**
- Modify: `src/web/features/calculator/CalculatorPage.tsx`

**Interfaces:**
- Consumes: `TierPicker`, `CountrySelect`
- Produces: Calculator uses polished controls; existing profit math unchanged

- [ ] **Step 1: Replace selects**

In `CalculatorPage.tsx`:

1. Import `TierPicker` and `CountrySelect`.
2. Replace the Tier `<select>` block with:

```tsx
            <label className="calc-control-tier">
              Tier
              <TierPicker value={tier} onChange={setTier} />
            </label>
```

3. Replace the Country `<select>` block with:

```tsx
            <label>
              Country
              <CountrySelect
                countries={countries}
                value={countryId}
                onChange={setCountryId}
                disabled={countries.length === 0}
              />
            </label>
```

Keep the incl. price input and breakdown logic unchanged.

- [ ] **Step 2: Run automated checks**

Run:

```bash
vp test src/server/iso.test.ts src/server/routes/countries.test.ts src/web/lib/flagEmoji.test.ts src/calculator/profit.test.ts
vp check
```

Expected: all PASS / check clean.

- [ ] **Step 3: Manual UI check**

With app running (`vp run` / project server scripts):

1. Calculator shows 6 gradient tiles; clicking changes scrap amount in details.
2. Country dropdown shows 🇸🇪 Sweden when seeded.
3. Countries admin can set ISO on another country and see the flag in Calculator.

- [ ] **Step 4: Commit**

```bash
git add src/web/features/calculator/CalculatorPage.tsx
git commit -m "feat: use TierPicker and CountrySelect on Calculator"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Optional `iso_code` + validation | 1, 2, 3 |
| Sweden `SE` seed/backfill | 2 |
| API expose `isoCode` | 3 |
| Flag emoji helper | 4 |
| Countries admin ISO field | 5 |
| Tall gradient tier tiles + chest + scrap footer | 6, 8 |
| Custom country dropdown with flags | 7, 8 |
| Calc math unchanged | 8 (no formula edits) |
