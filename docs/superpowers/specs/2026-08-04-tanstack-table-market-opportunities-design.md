# TanStack Table — Market opportunities sorting

**Date:** 2026-08-04  
**Status:** Approved for implementation  
**Surface:** Companies page → Market opportunities table  
**Related:** `src/web/features/companies/CompaniesPage.tsx`, `Opportunity` in `types.ts`

## Problem

The Market opportunities table is a static shadcn `Table` ranked by server-side G/PP. Users cannot reorder by Item, Best bonus, or ~G/day. The app also has no TanStack Table dependency yet, while future tools may need richer client table behavior (filtering, search, eventually server-driven lists).

## Goal

Introduce `@tanstack/react-table` (stable v8) and enable **client-side column sorting** on the Market opportunities table, with a companies-local table component — without building a shared mega-`DataTable` abstraction.

## Non-goals

- Shared app-wide `DataTable` / sortable-header package
- Filtering, global search, pagination, column visibility, row selection
- Server-side / manual sorting (countries, regions, MU browse later)
- URL-persisted sort state
- Migrating other existing tables (Jobs, Countries, Growth, etc.)
- TanStack Table v9 / `createTableHook` (beta; revisit later)

## Background (TanStack guidance)

TanStack Table is **headless**: it coordinates table state and row models; the app owns markup. shadcn’s Data Table docs warn against folding every variation into one component. This repo’s mix of tables (no sort, client sort, future server filter/search) fits **shared small pieces over time**, not one boolean-flagged wrapper.

For this first adoption: install the library and wire **one** table. Extract reusable headers/shells only when a second table needs the same UX.

## Design

### Dependency

- Add `@tanstack/react-table` (v8 stable) via the project package manager.
- Keep existing shadcn `@/components/ui/table` primitives for DOM.

### Component split

| Piece | Responsibility |
| --- | --- |
| `CompaniesPage` | Section title, blurb, pass `advisor?.opportunities ?? []` |
| `MarketOpportunitiesTable.tsx` (new, under `features/companies/`) | Column defs, `useReactTable`, sorting state, shadcn table render |

No changes to advisor API, query keys, or `Opportunity` shape.

### Columns

| Column id / accessor | Header | Sortable | Sort value |
| --- | --- | --- | --- |
| `itemCode` (display via `formatItem`) | Item | yes | Formatted item name string |
| `profitPerPp` | G/PP | yes | number; nulls last |
| `bestBonus` | Best bonus | yes | number; nulls last |
| `roughDailyValue` | ~G/day | yes | number; nulls last |
| `formula` | Formula | **no** | — |

Cell rendering stays visually equivalent to today: `ItemIcon` + name, `GoldAmount` for G/PP and ~G/day, bonus as `+X.X%` or `—` with region title, formula in muted mono.

### Sorting behavior

- **Initial state:** `[{ id: "profitPerPp", desc: true }]` — matches current server ranking.
- **Mode:** single-column sort (`enableMultiSort: false`).
- **Interaction:** TanStack default header cycle (asc → desc → clear). Clearing sort returns to unsorted row order (API order, still G/PP desc from server).
- **UI:** Sortable headers are keyboard-accessible buttons with a small direction indicator (e.g. lucide chevron) and `aria-sort` when active. Formula header is plain text.
- **Empty state:** Unchanged — single body row: “No price data yet — refresh prices.”

### Helpers

Move or duplicate only what the table needs (`formatItem`, gold/number display used in cells) into the new module or tiny local helpers so `CompaniesPage` company cards remain independent. Do not invent a shared table util package.

### Future (out of this change)

When a second table wants sorting, extract a small `DataTableColumnHeader`. When many tables share features, consider v9 `createTableHook` or a thin render shell — still prefer composition over `<DataTable sortable filterable serverSide />`.

Heavy geo search (countries / regions / MU) should use controlled sorting/filtering + TanStack Query (`manualSorting` / `manualFiltering`), not this client-only component.

## Testing

Repo web tests are mostly pure libs/query units, not RTL page mounts. Prefer:

- Manual: load `/companies`, confirm default G/PP desc, click Item / Best bonus / ~G/day, confirm Formula not clickable.
- Optional: pure unit test of null-last sort or column `sortingFn` if extracted as a tiny helper; skip if it stays inline in the component.

No e2e required for this slice. Run `vp check` (and any new unit test via `vp test`) before merge.

## Success criteria

1. `@tanstack/react-table` is a declared dependency.
2. Market opportunities table sorts by Item, G/PP, Best bonus, and ~G/day; Formula does not.
3. First paint matches today’s G/PP descending order.
4. No shared table abstraction beyond the companies-local component.
5. Other pages’ tables unchanged.
