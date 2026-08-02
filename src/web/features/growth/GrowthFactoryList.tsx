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
    <section>
      <h2 className="mt-0 mb-1 text-[1.05rem] font-semibold">
        Your Factories ({factories.length}/{MAX_COMPANIES})
      </h2>
      <p className="mb-2 text-sm text-muted-foreground">
        Adjust AE levels or remove factories for what-if planning.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Item</TableHead>
            <TableHead className="w-36">AE</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {factories.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground">
                No companies for this player.
              </TableCell>
            </TableRow>
          ) : (
            factories.map((f) => (
              <TableRow key={f.id}>
                <TableCell>
                  <div className="font-medium">{f.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {f.goldPerAePerDay.toFixed(3)} G/AE/day
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
                      −
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
                      +
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onRemove(f.id)}
                  >
                    Remove
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
