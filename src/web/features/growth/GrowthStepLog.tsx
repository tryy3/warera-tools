import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EditableFactory, FocusedPath, GrowthPlanResult, GrowthPlanStep } from "./types";

/** 3dcut-style duration: &lt;1h → minutes; &lt;24h → hours; else days. */
function formatStepTime(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return "—";
  if (hours < 1) {
    const mins = Math.max(0, Math.round(hours * 60));
    return `${mins}m`;
  }
  if (hours < 24) {
    const rounded = hours < 10 ? Number(hours.toFixed(1)) : Math.round(hours);
    return `${rounded}h`;
  }
  const days = hours / 24;
  const rounded = days < 10 ? Number(days.toFixed(1)) : Math.round(days);
  return `${rounded}d`;
}

function formatAction(step: GrowthPlanStep, factoryName?: string): string {
  const label = factoryName ?? step.factoryId;
  if (step.action === "buy") return `Buy ${label} (AE1)`;
  return `Upgrade ${label} AE${step.fromLevel}→${step.toLevel}`;
}

function pathTitle(path: FocusedPath): string {
  return path === "optimal" ? "Optimal" : "Upgrades-only";
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
  const nameById = new Map(factories.map((f) => [f.id, f.name]));
  const steps = result?.steps ?? [];

  return (
    <section>
      <h2 className="mt-0 mb-1 text-[1.05rem] font-semibold">Step log · {pathTitle(path)}</h2>
      <p className="mb-2 text-sm text-muted-foreground">
        {result == null
          ? "No plan for this path."
          : result.stuck
            ? "Path stuck — last reachable steps below."
            : result.hitIterLimit && !result.complete
              ? "Hit iteration limit — partial steps below."
              : steps.length === 0
                ? "Already at goal — no steps needed."
                : `${steps.length} steps to goal.`}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14">#</TableHead>
            <TableHead>Action</TableHead>
            <TableHead className="w-20">Time</TableHead>
            <TableHead className="w-24 text-right">Δ G/day</TableHead>
            <TableHead className="w-24 text-right">G spent</TableHead>
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
                <TableCell>{formatAction(step, nameById.get(step.factoryId))}</TableCell>
                <TableCell className="font-mono">{formatStepTime(step.tHours)}</TableCell>
                <TableCell className="text-right font-mono">
                  {step.deltaDailyGold >= 0 ? "+" : ""}
                  {step.deltaDailyGold.toFixed(2)}
                </TableCell>
                <TableCell className="text-right font-mono">{step.goldSpent.toFixed(1)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
}
