import { ArrowUpCircle, Building2, CalendarDays, Coins, ListOrdered } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatGold, formatPlanDuration, formatSignedGold } from "./format";
import { PATH_THEME } from "./pathTheme";
import type { EditableFactory, FocusedPath, GrowthPlanResult, GrowthPlanStep } from "./types";

function formatAction(step: GrowthPlanStep, factoryName?: string): string {
  const label =
    factoryName ??
    (step.factoryId.startsWith("new-") ? `Company #${step.factoryId.slice(4)}` : step.factoryId);
  if (step.action === "buy") return `Buy ${label}`;
  return `Upgrade ${label} · AE${step.fromLevel}→${step.toLevel}`;
}

export function GrowthStepLog({
  path,
  result,
  factories,
}: {
  path: FocusedPath;
  result: GrowthPlanResult | null;
  factories: EditableFactory[];
}) {
  const theme = PATH_THEME[path];
  const nameById = new Map(factories.map((f) => [f.id, f.name]));
  const steps = result?.steps ?? [];

  let statusLine = "No plan for this path.";
  if (result) {
    if (result.stuck) statusLine = "Path stuck — last reachable steps below.";
    else if (result.hitIterLimit && !result.complete)
      statusLine = "Step limit reached — partial steps below.";
    else if (steps.length === 0) statusLine = "Already at goal — nothing to do.";
    else
      statusLine = `${steps.length} steps · ${formatPlanDuration(result.timeToGoalHours)} to goal`;
  }

  return (
    <section
      className="rounded-xl border p-3.5"
      style={{ borderColor: theme.border, background: theme.soft }}
    >
      <div className="mb-2 flex items-center gap-2">
        <ListOrdered className={cn("size-4", theme.text)} aria-hidden />
        <h2 className={cn("m-0 text-[1.05rem] font-semibold", theme.text)}>
          Build plan · {theme.label}
        </h2>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">{statusLine}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Action</TableHead>
            <TableHead className="w-20">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5 opacity-70" aria-hidden />
                When
              </span>
            </TableHead>
            <TableHead className="w-24 text-right">Δ G/day</TableHead>
            <TableHead className="w-24 text-right">
              <span className="inline-flex items-center justify-end gap-1">
                <Coins className="size-3.5 opacity-70" aria-hidden />
                Cost
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {steps.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No steps.
              </TableCell>
            </TableRow>
          ) : (
            steps.map((step, i) => (
              <TableRow key={`${step.tHours}-${step.factoryId}-${i}`}>
                <TableCell className="font-mono text-muted-foreground">{i + 1}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5">
                    {step.action === "buy" ? (
                      <Building2 className={cn("size-3.5 shrink-0", theme.text)} aria-hidden />
                    ) : (
                      <ArrowUpCircle className={cn("size-3.5 shrink-0", theme.text)} aria-hidden />
                    )}
                    {formatAction(step, nameById.get(step.factoryId))}
                  </span>
                </TableCell>
                <TableCell className="font-mono">{formatPlanDuration(step.tHours)}</TableCell>
                <TableCell className="text-right font-mono">
                  {formatSignedGold(step.deltaDailyGold, 2)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatGold(step.goldSpent, 1)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
}
