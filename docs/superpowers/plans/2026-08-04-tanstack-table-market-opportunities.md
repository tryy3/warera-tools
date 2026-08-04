# TanStack Table Market Opportunities Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `@tanstack/react-table` (v8) and client-side column sorting to the Companies Market opportunities table via a companies-local component.

**Architecture:** Install TanStack Table v8. Extract a tiny pure `nullsLastSortingFn` for numeric null handling. Move the opportunities table markup into `MarketOpportunitiesTable.tsx` with local column defs, `useReactTable`, and shadcn `Table` primitives. `CompaniesPage` only passes `opportunities`. No shared app-wide DataTable.

**Tech Stack:** React 19, `@tanstack/react-table` v8, existing shadcn `@/components/ui/table` + `Button`, lucide-react icons, Vitest via `vp test`.

**Design:** [2026-08-04-tanstack-table-market-opportunities-design.md](../specs/2026-08-04-tanstack-table-market-opportunities-design.md)

## Global Constraints

- Use stable **TanStack Table v8** (`useReactTable`), not v9 / `createTableHook`
- Companies-local only — no shared `DataTable` or sortable-header package
- Sortable: Item, G/PP, Best bonus, ~G/day; **not** Formula
- Initial sort: `[{ id: "profitPerPp", desc: true }]`
- Single-column sort (`enableMultiSort: false`)
- Numeric nulls sort **last**
- Preserve existing cell visuals and empty-state copy
- Do not change advisor API, query keys, or `Opportunity` type
- Prefer file-scoped Vitest: `vp test path/to/file.test.ts`
- Commit after each task

## File Structure

| Path | Responsibility |
| --- | --- |
| `package.json` / lockfile | Add `@tanstack/react-table` dependency |
| `src/web/features/companies/nullsLastSortingFn.ts` | Pure numeric/null sortingFn for TanStack |
| `src/web/features/companies/nullsLastSortingFn.test.ts` | Unit tests for nulls-last behavior |
| `src/web/features/companies/MarketOpportunitiesTable.tsx` | Columns, `useReactTable`, sortable headers, shadcn table |
| `src/web/features/companies/CompaniesPage.tsx` | Replace inline table with `<MarketOpportunitiesTable />` |

---

### Task 1: Add dependency + nulls-last sortingFn

**Files:**
- Modify: `package.json` (via `vp add`)
- Create: `src/web/features/companies/nullsLastSortingFn.ts`
- Create: `src/web/features/companies/nullsLastSortingFn.test.ts`

**Interfaces:**
- Consumes: `SortingFn` from `@tanstack/react-table`
- Produces: `export const nullsLastSortingFn: SortingFn<unknown>`

- [ ] **Step 1: Add the package**

```bash
export PATH="/home/tryy3/.vite-plus/bin:$PATH"
cd /home/tryy3/src/warera
vp add @tanstack/react-table
```

Expected: `@tanstack/react-table` appears under `dependencies` in `package.json` (v8.x range).

- [ ] **Step 2: Write the failing test**

Create `src/web/features/companies/nullsLastSortingFn.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nullsLastSortingFn } from "./nullsLastSortingFn";

type Row = { getValue: (columnId: string) => number | null };

function row(value: number | null): Row {
  return { getValue: () => value };
}

describe("nullsLastSortingFn", () => {
  it("orders finite numbers ascending", () => {
    expect(nullsLastSortingFn(row(1) as never, row(2) as never, "x")).toBeLessThan(0);
    expect(nullsLastSortingFn(row(2) as never, row(1) as never, "x")).toBeGreaterThan(0);
    expect(nullsLastSortingFn(row(1) as never, row(1) as never, "x")).toBe(0);
  });

  it("puts nulls after finite numbers", () => {
    expect(nullsLastSortingFn(row(null) as never, row(1) as never, "x")).toBeGreaterThan(0);
    expect(nullsLastSortingFn(row(1) as never, row(null) as never, "x")).toBeLessThan(0);
    expect(nullsLastSortingFn(row(null) as never, row(null) as never, "x")).toBe(0);
  });

  it("treats non-finite numbers like null", () => {
    expect(nullsLastSortingFn(row(Number.NaN) as never, row(1) as never, "x")).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
export PATH="/home/tryy3/.vite-plus/bin:$PATH"
vp test src/web/features/companies/nullsLastSortingFn.test.ts
```

Expected: FAIL (module not found / `nullsLastSortingFn` missing).

- [ ] **Step 4: Implement sortingFn**

Create `src/web/features/companies/nullsLastSortingFn.ts`:

```ts
import type { SortingFn } from "@tanstack/react-table";

function isSortableNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Ascending compare; null / non-finite values sort after finite numbers. */
export const nullsLastSortingFn: SortingFn<unknown> = (rowA, rowB, columnId) => {
  const a = rowA.getValue(columnId);
  const b = rowB.getValue(columnId);
  const aOk = isSortableNumber(a);
  const bOk = isSortableNumber(b);
  if (!aOk && !bOk) return 0;
  if (!aOk) return 1;
  if (!bOk) return -1;
  return a === b ? 0 : a < b ? -1 : 1;
};
```

- [ ] **Step 5: Run test to verify it passes**

```bash
export PATH="/home/tryy3/.vite-plus/bin:$PATH"
vp test src/web/features/companies/nullsLastSortingFn.test.ts
```

Expected: PASS (all three tests).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/web/features/companies/nullsLastSortingFn.ts src/web/features/companies/nullsLastSortingFn.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add tanstack table and nulls-last sort helper

EOF
)"
```

(If the lockfile name differs, stage whatever `vp add` updated.)

---

### Task 2: `MarketOpportunitiesTable` component

**Files:**
- Create: `src/web/features/companies/MarketOpportunitiesTable.tsx`

**Interfaces:**
- Consumes: `Opportunity` from `./types`, `nullsLastSortingFn` from `./nullsLastSortingFn`, `@tanstack/react-table`, shadcn table + Button, `ItemIcon`, `GoldIcon`, `formatDisplayNumber`
- Produces: `export function MarketOpportunitiesTable({ opportunities }: { opportunities: Opportunity[] })`

- [ ] **Step 1: Create the component**

Create `src/web/features/companies/MarketOpportunitiesTable.tsx` with the full contents below.

```tsx
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { GoldIcon } from "../../components/GoldIcon";
import { ItemIcon } from "../../components/ItemIcon";
import { nullsLastSortingFn } from "./nullsLastSortingFn";
import type { Opportunity } from "./types";

function formatItem(code: string): string {
  return code.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function formatNum(value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatDisplayNumber(value, digits);
}

function GoldAmount({ value, digits = 4 }: { value: number | null | undefined; digits?: number }) {
  if (value == null || !Number.isFinite(value)) return "—";
  return (
    <span className="inline-flex items-center gap-1.5">
      <GoldIcon />
      {formatDisplayNumber(value, digits)}
    </span>
  );
}

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") return <ArrowUp className="size-3.5 opacity-70" aria-hidden />;
  if (sorted === "desc") return <ArrowDown className="size-3.5 opacity-70" aria-hidden />;
  return <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />;
}

const columns: ColumnDef<Opportunity>[] = [
  {
    id: "item",
    accessorFn: (row) => formatItem(row.itemCode),
    header: ({ column }) => {
      const sorted = column.getIsSorted();
      return (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2.5 h-8 gap-1 px-2.5 font-medium text-foreground"
          onClick={column.getToggleSortingHandler()}
          aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
        >
          Item
          <SortIcon sorted={sorted} />
        </Button>
      );
    },
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5">
        <ItemIcon itemCode={row.original.itemCode} />
        {formatItem(row.original.itemCode)}
      </span>
    ),
  },
  {
    accessorKey: "profitPerPp",
    header: ({ column }) => {
      const sorted = column.getIsSorted();
      return (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2.5 h-8 gap-1 px-2.5 font-medium text-foreground"
          onClick={column.getToggleSortingHandler()}
          aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
        >
          G/PP
          <SortIcon sorted={sorted} />
        </Button>
      );
    },
    cell: ({ row }) => (
      <span className="font-mono">
        <GoldAmount value={row.original.profitPerPp} digits={4} />
      </span>
    ),
    sortingFn: nullsLastSortingFn,
  },
  {
    accessorKey: "bestBonus",
    header: ({ column }) => {
      const sorted = column.getIsSorted();
      return (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2.5 h-8 gap-1 px-2.5 font-medium text-foreground"
          onClick={column.getToggleSortingHandler()}
          aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
        >
          Best bonus
          <SortIcon sorted={sorted} />
        </Button>
      );
    },
    cell: ({ row }) => {
      const o = row.original;
      return (
        <span className="font-mono" title={o.bestRegionName ?? o.bestRegionId ?? undefined}>
          {o.bestBonus != null && Number.isFinite(o.bestBonus)
            ? `+${formatNum(o.bestBonus * 100, 1)}%`
            : "—"}
        </span>
      );
    },
    sortingFn: nullsLastSortingFn,
  },
  {
    accessorKey: "roughDailyValue",
    header: ({ column }) => {
      const sorted = column.getIsSorted();
      return (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2.5 h-8 gap-1 px-2.5 font-medium text-foreground"
          onClick={column.getToggleSortingHandler()}
          aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
        >
          ~G/day
          <SortIcon sorted={sorted} />
        </Button>
      );
    },
    cell: ({ row }) => (
      <span className="font-mono">
        <GoldAmount value={row.original.roughDailyValue} digits={2} />
      </span>
    ),
    sortingFn: nullsLastSortingFn,
  },
  {
    accessorKey: "formula",
    enableSorting: false,
    header: "Formula",
    cell: ({ row }) => (
      <span className="font-mono text-sm text-muted-foreground">{row.original.formula}</span>
    ),
  },
];

export function MarketOpportunitiesTable({ opportunities }: { opportunities: Opportunity[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "profitPerPp", desc: true }]);

  const table = useReactTable({
    data: opportunities,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableMultiSort: false,
    getRowId: (row) => row.itemCode,
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length > 0 ? (
          table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={columns.length} className="text-muted-foreground">
              No price data yet — refresh prices.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: Typecheck the new file in isolation mindset**

```bash
export PATH="/home/tryy3/.vite-plus/bin:$PATH"
vp check
```

If `vp check` fails only because `CompaniesPage` still has the old table, that is OK for this task — fix type errors inside `MarketOpportunitiesTable.tsx` / imports before committing. Prefer committing a type-clean component even if unused yet.

If full-project check is noisy, at minimum ensure the new file has no TS errors (fix import paths for `GoldIcon` / `ItemIcon` / `@/` aliases to match `CompaniesPage`).

- [ ] **Step 3: Commit**

```bash
git add src/web/features/companies/MarketOpportunitiesTable.tsx
git commit -m "$(cat <<'EOF'
feat(web): add sortable MarketOpportunitiesTable

EOF
)"
```

---

### Task 3: Wire `CompaniesPage` + verify

**Files:**
- Modify: `src/web/features/companies/CompaniesPage.tsx`

**Interfaces:**
- Consumes: `MarketOpportunitiesTable` from `./MarketOpportunitiesTable`
- Produces: Market opportunities section renders the new table; unused `Table*` imports removed if no longer needed elsewhere in the file

- [ ] **Step 1: Replace the inline table**

In `CompaniesPage.tsx`:

1. Add import:

```ts
import { MarketOpportunitiesTable } from "./MarketOpportunitiesTable";
```

2. In the Market opportunities `<section>`, **keep** the `<h2>` and blurb `<p>`, then replace the entire `<Table>...</Table>` block with:

```tsx
<MarketOpportunitiesTable opportunities={advisor?.opportunities ?? []} />
```

3. Remove unused imports from `@/components/ui/table` **only if** nothing else in this file still uses them. (As of the pre-change page, `Table*` is only used by the opportunities table — company cards use `Card`. After the swap, drop `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` from imports.)

Do **not** remove `GoldAmount` / `formatItem` / `formatNum` from `CompaniesPage` — company cards still need them.

- [ ] **Step 2: Run checks**

```bash
export PATH="/home/tryy3/.vite-plus/bin:$PATH"
vp test src/web/features/companies/nullsLastSortingFn.test.ts
vp check
```

Expected: tests PASS; `vp check` PASS (format/lint/types clean).

- [ ] **Step 3: Manual smoke (if `vp run dev` is available)**

Load `/companies` with a player that has opportunities:

1. Default order matches G/PP descending (same as before).
2. Click **Item** — rows reorder alphabetically; chevron shows direction.
3. Click **Best bonus** / **~G/day** — numeric reorder; nulls at bottom.
4. **Formula** header is not a button / does not change order.
5. Empty advisor opportunities still shows “No price data yet — refresh prices.”

- [ ] **Step 4: Commit**

```bash
git add src/web/features/companies/CompaniesPage.tsx
git commit -m "$(cat <<'EOF'
feat(web): wire sortable opportunities table on companies page

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Add `@tanstack/react-table` v8 | Task 1 |
| Companies-local `MarketOpportunitiesTable` | Task 2 |
| `CompaniesPage` passes opportunities only | Task 3 |
| Sort Item / G/PP / Best bonus / ~G/day | Task 2 |
| Formula not sortable | Task 2 (`enableSorting: false`) |
| Initial G/PP desc | Task 2 (`useState` initial sorting) |
| Single-column sort | Task 2 (`enableMultiSort: false`) |
| Nulls last on numerics | Task 1 + Task 2 `sortingFn` |
| Cell visuals + empty copy preserved | Task 2 |
| No API / type / shared DataTable changes | All tasks |
| Optional pure unit test | Task 1 |
| `vp check` | Task 3 |
