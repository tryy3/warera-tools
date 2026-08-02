import { Factory, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ItemIcon } from "../../components/ItemIcon";
import { formatItem } from "../market/formatItem";
import { formatGold } from "./format";
import type { EditableFactory } from "./types";

const MAX_COMPANIES = 12;

export function GrowthFactoryList({
  factories,
  onAeLevelChange,
  onRemove,
}: {
  factories: EditableFactory[];
  onAeLevelChange: (id: string, aeLevel: number) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-secondary/40 p-3.5">
      <div className="mb-1 flex items-center gap-2">
        <Factory className="size-4 text-sky-300" aria-hidden />
        <h2 className="m-0 text-[1.05rem] font-semibold">
          Your factories{" "}
          <span className="font-mono text-muted-foreground">
            ({factories.length}/{MAX_COMPANIES})
          </span>
        </h2>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Tweak AE or remove companies for what-if planning.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Item</TableHead>
            <TableHead className="w-36">AE</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {factories.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground">
                No companies — planners will buy from scratch toward your goal.
              </TableCell>
            </TableRow>
          ) : (
            factories.map((f) => (
              <TableRow key={f.id}>
                <TableCell>
                  <div className="font-medium">{f.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {formatGold(f.goldPerAePerDay, 2)} G/AE/day
                  </div>
                </TableCell>
                <TableCell>
                  {f.itemCode ? (
                    <span className="inline-flex items-center gap-1.5">
                      <ItemIcon itemCode={f.itemCode} />
                      {formatItem(f.itemCode)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      aria-label={`Decrease AE for ${f.name}`}
                      disabled={f.aeLevel <= 1}
                      onClick={() => onAeLevelChange(f.id, f.aeLevel - 1)}
                    >
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="w-6 text-center font-mono tabular-nums">{f.aeLevel}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      aria-label={`Increase AE for ${f.name}`}
                      disabled={f.aeLevel >= 7}
                      onClick={() => onAeLevelChange(f.id, f.aeLevel + 1)}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-destructive hover:text-destructive"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => onRemove(f.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
}
