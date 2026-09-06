# Equipment Detail Dual Price Boxes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the equipment detail page, stack tax-incl and tax-excl in shared price boxes (Market, Break-even, Attractive), remove the seller-excl toggle and duplicate Recommend Market cell, and display gold amounts with max 3 decimals.

**Architecture:** Keep API/DTOs unchanged. Add a tiny pure `exclFromIncl` helper plus a presentational `GoldInclExclBox`. Rewire `EquipmentDetailPage` Price triad + Recommend to use them; scrap and Vs market stay single-value.

**Tech Stack:** React 19, TypeScript, existing `formatDisplayNumber`, Vitest via `vp test`, Vite+ (`vp check`).

**Design:** [2026-09-06-equipment-detail-dual-price-boxes-design.md](../specs/2026-09-06-equipment-detail-dual-price-boxes-design.md)

## Global Constraints

- Scope = equipment **detail** page only — do not change overview cards or charts
- Dual boxes stack **incl** (primary) then **excl** (muted); never side-by-side columns
- When tax missing, excl row still renders as `—`
- Remove “Show / Hide seller excl” toggle and `showSellerNet` state
- Recommend drops duplicate Market box; keep Break-even, Attractive, Vs market
- Gold display digits = **3** in Price triad + Recommend (including Vs market numeric deltas)
- Market excl uses API `sellerNet`; recommend excl = `incl / (1 + taxRate)` only when tax known
- No API / DTO / server formula changes
- Prefer `vp test path` / `vp check` for verification
- Commit after each task

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/web/features/equipment-market/taxExcl.ts` | `exclFromIncl(incl, taxRate)` → excl or null |
| `src/web/features/equipment-market/taxExcl.test.ts` | Unit tests for excl derivation |
| `src/web/features/equipment-market/GoldInclExclBox.tsx` | Bordered dual-value price box (incl + excl lines) |
| `src/web/features/equipment-market/EquipmentDetailPage.tsx` | Wire dual boxes; remove toggle; 3-decimal formatting |
| Spec status | Already **Approved for implementation** |

---

### Task 1: `exclFromIncl` helper

**Files:**
- Create: `src/web/features/equipment-market/taxExcl.ts`
- Create: `src/web/features/equipment-market/taxExcl.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `export function exclFromIncl(incl: number | null | undefined, taxRate: number | null | undefined): number | null`
  - Returns `null` when incl or taxRate is null/undefined/non-finite, or when `taxRate <= -1` would make the divisor non-positive
  - Otherwise returns `incl / (1 + taxRate)`

- [ ] **Step 1: Write the failing test**

Create `src/web/features/equipment-market/taxExcl.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { exclFromIncl } from "./taxExcl";

describe("exclFromIncl", () => {
  it("divides incl by (1 + taxRate)", () => {
    expect(exclFromIncl(40, 0.01)).toBeCloseTo(40 / 1.01, 10);
  });

  it("returns null when taxRate is missing", () => {
    expect(exclFromIncl(40, null)).toBeNull();
    expect(exclFromIncl(40, undefined)).toBeNull();
  });

  it("returns null when incl is missing or non-finite", () => {
    expect(exclFromIncl(null, 0.01)).toBeNull();
    expect(exclFromIncl(undefined, 0.01)).toBeNull();
    expect(exclFromIncl(Number.NaN, 0.01)).toBeNull();
  });

  it("returns null when taxRate is non-finite or divisor would be non-positive", () => {
    expect(exclFromIncl(40, Number.NaN)).toBeNull();
    expect(exclFromIncl(40, -1)).toBeNull();
    expect(exclFromIncl(40, -1.5)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/web/features/equipment-market/taxExcl.test.ts`

Expected: FAIL (module `./taxExcl` not found / cannot resolve)

- [ ] **Step 3: Write minimal implementation**

Create `src/web/features/equipment-market/taxExcl.ts`:

```ts
export function exclFromIncl(
  incl: number | null | undefined,
  taxRate: number | null | undefined,
): number | null {
  if (incl == null || taxRate == null) return null;
  if (!Number.isFinite(incl) || !Number.isFinite(taxRate)) return null;
  const divisor = 1 + taxRate;
  if (!(divisor > 0)) return null;
  return incl / divisor;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/web/features/equipment-market/taxExcl.test.ts`

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/web/features/equipment-market/taxExcl.ts src/web/features/equipment-market/taxExcl.test.ts
git commit -m "$(cat <<'EOF'
feat(equipment): add exclFromIncl tax helper

EOF
)"
```

---

### Task 2: Dual price boxes on detail page

**Files:**
- Create: `src/web/features/equipment-market/GoldInclExclBox.tsx`
- Modify: `src/web/features/equipment-market/EquipmentDetailPage.tsx`

**Interfaces:**
- Consumes: `exclFromIncl` from `./taxExcl`; `formatDisplayNumber` from `@/lib/formatDisplayNumber`; `GoldIcon` from `../../components/GoldIcon`
- Produces:
  - `export const EQUIPMENT_GOLD_DIGITS = 3`
  - `export function GoldInclExclBox(props: { label: string; incl: number | null | undefined; excl: number | null | undefined }): JSX.Element`
  - Box title = `label` (no “incl”/“excl” in the title)
  - Primary line: gold icon + `formatDisplayNumber(incl, EQUIPMENT_GOLD_DIGITS)` or `—`
  - Secondary muted line: small `excl` label + gold amount or `—`
  - Detail page Price triad: Market (`incl=marketMedian`, `excl=sellerNet`) + single Scrap box; grid `sm:grid-cols-2`
  - Recommend: Break-even + Attractive via `exclFromIncl(…, taxRate)`; Vs market; grid `sm:grid-cols-2 lg:grid-cols-3`
  - Remove `showSellerNet` state, toggle Button, and Recommend Market box
  - Local `GoldAmount` and `marketVsRecommend` use `EQUIPMENT_GOLD_DIGITS` (3)

- [ ] **Step 1: Add `GoldInclExclBox`**

Create `src/web/features/equipment-market/GoldInclExclBox.tsx`:

```tsx
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { GoldIcon } from "../../components/GoldIcon";

export const EQUIPMENT_GOLD_DIGITS = 3;

function GoldLine({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 font-mono">
      <GoldIcon />
      {formatDisplayNumber(value, EQUIPMENT_GOLD_DIGITS)}
    </span>
  );
}

export function GoldInclExclBox({
  label,
  incl,
  excl,
}: {
  label: string;
  incl: number | null | undefined;
  excl: number | null | undefined;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
      <div className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-1">
        <GoldLine value={incl} />
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="text-[0.7em] tracking-wide uppercase">excl</span>
        <GoldLine value={excl} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewire `EquipmentDetailPage`**

In `src/web/features/equipment-market/EquipmentDetailPage.tsx`:

1. Add imports:

```ts
import { exclFromIncl } from "./taxExcl";
import { EQUIPMENT_GOLD_DIGITS, GoldInclExclBox } from "./GoldInclExclBox";
```

2. Change local `GoldAmount` to use 3 digits:

```tsx
function GoldAmount({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 font-mono">
      <GoldIcon />
      {formatDisplayNumber(value, EQUIPMENT_GOLD_DIGITS)}
    </span>
  );
}
```

3. In `marketVsRecommend`, pass `EQUIPMENT_GOLD_DIGITS` to every `formatDisplayNumber(...)` call for the deltas.

4. Remove `const [showSellerNet, setShowSellerNet] = useState(true);`

5. Remove the unused `Button` import if it is no longer used elsewhere in the file.

6. Replace the Price triad section header + grid with:

```tsx
<section className="mt-5">
  <h2 className="mt-0 mb-2 text-[1.05rem] font-semibold">Price triad</h2>

  {taxMissing ? (
    <p className="mb-2 text-sm text-amber-200/90">
      Pick a country to unlock seller net and recommend pricing.
    </p>
  ) : null}

  {detail?.scrapPrice == null ? (
    <p className="mb-2 text-sm text-amber-200/90">
      Scrap price missing — scrap value and recommend unavailable.
    </p>
  ) : null}

  <div className="grid gap-3 sm:grid-cols-2">
    <GoldInclExclBox
      label="Market"
      incl={detail?.marketMedian}
      excl={detail?.sellerNet}
    />
    <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
      <div className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
        Scrap price
      </div>
      <div className="mt-1">
        <GoldAmount value={detail?.scrapFloor} />
      </div>
    </div>
  </div>
</section>
```

7. Replace the Recommend available branch (`detail.recommend != null`) grid with:

```tsx
<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
  <GoldInclExclBox
    label="Break-even"
    incl={detail.recommend.breakEvenIncl}
    excl={exclFromIncl(detail.recommend.breakEvenIncl, taxRate)}
  />
  <GoldInclExclBox
    label="Attractive (+5%)"
    incl={detail.recommend.attractiveIncl}
    excl={exclFromIncl(detail.recommend.attractiveIncl, taxRate)}
  />
  <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2 sm:col-span-2 lg:col-span-1">
    <div className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
      Vs market
    </div>
    <div className="mt-1 text-sm">
      {vsMarket ?? <span className="text-muted-foreground">—</span>}
    </div>
  </div>
</div>
```

Keep the existing `taxMissing` / `recommend == null` messaging branches unchanged.

- [ ] **Step 3: Verify helper tests still pass + typecheck/lint**

Run:

```bash
vp test src/web/features/equipment-market/taxExcl.test.ts
vp check
```

Expected: tests PASS; `vp check` clean for the touched files (fix any format/lint issues it reports in the new/edited files).

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run `vp run dev`, open `/equipment/<anyItemCode>`:

- Market box shows stacked incl then excl when a country is selected
- With country cleared / tax missing, Market excl shows `—`; amber note still present
- Recommend shows Break-even + Attractive (each dual) + Vs market — no Market box, no seller toggle
- Amounts show at most 3 decimals

- [ ] **Step 5: Commit**

```bash
git add \
  src/web/features/equipment-market/GoldInclExclBox.tsx \
  src/web/features/equipment-market/EquipmentDetailPage.tsx
git commit -m "$(cat <<'EOF'
feat(equipment): stack incl/excl on detail price boxes

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Detail-only scope | Task 2 (overview untouched) |
| Stacked Market incl+excl | Task 2 |
| Remove seller excl toggle | Task 2 |
| Break-even + Attractive dual stack | Task 2 + Task 1 helper |
| Drop Recommend Market box | Task 2 |
| Keep Vs market (incl-based) | Task 2 |
| Excl row `—` when no tax | Task 1 null + Task 2 always renders excl line |
| Scrap single-value | Task 2 |
| Max 3 decimals | Task 2 `EQUIPMENT_GOLD_DIGITS` |
| No API/DTO changes | Both tasks |
