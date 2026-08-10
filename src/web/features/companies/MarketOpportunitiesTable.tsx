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
import { useMemo, useState } from "react";
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
import { OpportunityItemModal } from "./OpportunityItemModal";
import { nullsLastSortingFn } from "./nullsLastSortingFn";
import { useItemPriceBoard } from "./sessionPrices/ItemPriceBoardProvider";
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

function PriceCell({
  value,
  live,
  dirty,
}: {
  value: number | null | undefined;
  live: number | null | undefined;
  dirty: boolean;
}) {
  const title =
    dirty && live != null && Number.isFinite(live)
      ? `Live: ${formatDisplayNumber(live, 4)} G`
      : undefined;
  return (
    <span className={dirty ? "font-mono text-amber-200" : "font-mono"} title={title}>
      <GoldAmount value={value} />
      {dirty ? (
        <span className="ml-1 text-[0.7em] tracking-wide text-amber-200/80 uppercase">custom</span>
      ) : null}
    </span>
  );
}

export function MarketOpportunitiesTable() {
  const board = useItemPriceBoard();
  const [sorting, setSorting] = useState<SortingState>([{ id: "profitPerPp", desc: true }]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  const columns = useMemo<ColumnDef<Opportunity>[]>(
    () => [
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
        id: "buy",
        accessorFn: (row) => toSortableNumber(row.buyPrice),
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
              Buy
              <SortIcon sorted={sorted} />
            </Button>
          );
        },
        cell: ({ row }) => {
          const code = row.original.itemCode;
          const live = board.liveOpportunity(code)?.buyPrice;
          return (
            <PriceCell
              value={row.original.buyPrice}
              live={live}
              dirty={board.isDirty(code, "buy")}
            />
          );
        },
        sortingFn: numericSortingFn,
      },
      {
        id: "sell",
        accessorFn: (row) => toSortableNumber(row.sellPrice),
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
              Sell
              <SortIcon sorted={sorted} />
            </Button>
          );
        },
        cell: ({ row }) => {
          const code = row.original.itemCode;
          const live = board.liveOpportunity(code)?.sellPrice;
          return (
            <PriceCell
              value={row.original.sellPrice}
              live={live}
              dirty={board.isDirty(code, "sell")}
            />
          );
        },
        sortingFn: numericSortingFn,
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
    ],
    [board],
  );

  const table = useReactTable({
    data: board.opportunities,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableMultiSort: false,
    getRowId: (row) => row.itemCode,
  });

  const selected =
    selectedItem != null
      ? (board.opportunities.find((o) => o.itemCode === selectedItem) ?? null)
      : null;

  return (
    <>
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
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => setSelectedItem(row.original.itemCode)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedItem(row.original.itemCode);
                  }
                }}
                tabIndex={0}
              >
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
      <OpportunityItemModal
        open={selected != null}
        opportunity={selected}
        onClose={() => setSelectedItem(null)}
      />
    </>
  );
}
