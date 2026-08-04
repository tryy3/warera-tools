import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingFn,
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

function toSortableNumber(value: number | null | undefined): number | undefined {
  return value != null && Number.isFinite(value) ? value : undefined;
}

const numericSortingFn = nullsLastSortingFn as SortingFn<Opportunity>;

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
    id: "profitPerPp",
    accessorFn: (row) => toSortableNumber(row.profitPerPp),
    sortUndefined: "last",
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
    sortingFn: numericSortingFn,
  },
  {
    id: "bestBonus",
    accessorFn: (row) => toSortableNumber(row.bestBonus),
    sortUndefined: "last",
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
    sortingFn: numericSortingFn,
  },
  {
    id: "roughDailyValue",
    accessorFn: (row) => toSortableNumber(row.roughDailyValue),
    sortUndefined: "last",
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
    sortingFn: numericSortingFn,
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
