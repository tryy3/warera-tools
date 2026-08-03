import { Briefcase, Building2, Factory, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { skillValueFromLevel } from "@/skills/values";
import { GoldIcon } from "../../components/GoldIcon";
import type { DailyIncomeBreakdown, SkillsJob, SkillsLevels, UserCompany } from "./types";
import { formatGold, formatSignedGold } from "./format";

function aeDaily(aeLevel: number, bonus: number, profitPerPp: number): number {
  return aeLevel * (1 + bonus) * 24 * profitPerPp;
}

function FormulaBox({ label, children }: { label: string; children: string }) {
  return (
    <div className="mt-2 rounded border border-dashed border-primary/35 bg-black/20 px-2.5 py-2">
      <div className="mb-0.5 text-[0.7em] tracking-wider text-primary uppercase">{label}</div>
      <code className="block font-mono text-[0.78em] leading-snug break-words whitespace-pre-wrap text-foreground">
        {children}
      </code>
    </div>
  );
}

type IncomeStackProps = {
  income: DailyIncomeBreakdown;
  loadedTotal: number;
  levels: SkillsLevels;
  netWage: number;
  onNetWageChange: (value: number) => void;
  job: SkillsJob;
  companies: UserCompany[];
  selfWorkCompanyId: string;
  onSelfWorkCompanyChange: (id: string) => void;
};

function parseNumberInput(raw: string, fallback = 0): number {
  if (raw === "" || raw === "-" || raw === "." || raw === "-.") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function IncomeStack({
  income,
  loadedTotal,
  levels,
  netWage,
  onNetWageChange,
  job,
  companies,
  selfWorkCompanyId,
  onSelfWorkCompanyChange,
}: IncomeStackProps) {
  const delta = income.totalGPerDay - loadedTotal;
  const energy = skillValueFromLevel("energy", levels.energy);
  const entre = skillValueFromLevel("entrepreneurship", levels.entrepreneurship);
  const prod = skillValueFromLevel("production", levels.production);
  const companiesValue = skillValueFromLevel("companies", levels.companies);

  const selfCompany = companies.find((c) => c.id === income.selfWorkCompanyId) ?? null;
  const workFormula = `${formatGold(income.workActionsPerDay, 2)} actions × ${formatGold(income.ppPerAction, 0)} PP × ${formatGold(netWage, 4)} net wage`;
  const selfFormula = selfCompany
    ? `${formatGold(income.selfWorkActionsPerDay, 2)} actions × ${formatGold(income.ppPerAction, 0)} PP × (1+${formatGold(selfCompany.productionBonus, 2)}) × ${formatGold(selfCompany.profitPerPp, 4)} G/PP`
    : "No company selected";

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card px-5 py-5">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(ellipse 50% 80% at 0% 0%, rgba(251,191,36,0.14), transparent 55%), radial-gradient(ellipse 45% 70% at 100% 0%, rgba(45,212,191,0.1), transparent 50%)",
          }}
          aria-hidden
        />
        <div className="relative">
          <p className="mb-1 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Daily eco income
          </p>
          <p className="m-0 flex flex-wrap items-baseline gap-3">
            <span className="inline-flex items-center gap-2 text-4xl font-semibold tracking-tight tabular-nums">
              <GoldIcon className="size-7" />
              {formatGold(income.totalGPerDay, 2)}
              <span className="text-lg font-normal text-muted-foreground">G/day</span>
            </span>
            {Math.abs(delta) > 1e-9 ? (
              <span
                className={
                  delta > 0
                    ? "text-sm font-medium text-teal-300"
                    : "text-sm font-medium text-amber-200"
                }
              >
                {formatSignedGold(delta, 2)} vs loaded
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">matches loaded</span>
            )}
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Briefcase className="size-4 text-sky-300" aria-hidden />
              Work
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="m-0 text-2xl font-semibold tabular-nums">
              {formatGold(income.workGPerDay, 2)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">G/day</span>
            </p>
            <FormulaBox label="Formula">{workFormula}</FormulaBox>
            <p className="mt-1.5 mb-0 text-xs text-muted-foreground">
              Energy {formatGold(energy, 0)} → {formatGold(income.workActionsPerDay, 2)} actions/day
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Factory className="size-4 text-teal-300" aria-hidden />
              Self-work
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="m-0 text-2xl font-semibold tabular-nums">
              {formatGold(income.selfWorkGPerDay, 2)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">G/day</span>
            </p>
            <FormulaBox label="Formula">{selfFormula}</FormulaBox>
            <p className="mt-1.5 mb-0 text-xs text-muted-foreground">
              Entrepreneurship {formatGold(entre, 0)} · Production {formatGold(prod, 0)} PP
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Building2 className="size-4 text-amber-200" aria-hidden />
              AE
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="m-0 text-2xl font-semibold tabular-nums">
              {formatGold(income.aeGPerDay, 2)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">G/day</span>
            </p>
            <FormulaBox label="Formula">{`top ${income.activeSlots} of ${companies.length} slots (Companies Limit ${formatGold(companiesValue, 0)})`}</FormulaBox>
          </CardContent>
        </Card>
      </div>

      <section className="rounded-xl border border-border bg-card/80 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Wallet className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="m-0 text-base font-semibold">Situation</h2>
        </div>

        {job.status === "unemployed" ? (
          <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            No employer found — work income is 0 unless you override net wage.
          </p>
        ) : null}
        {job.status === "lookupFailed" ? (
          <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            Wage lookup failed — enter a net wage to model work income.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="net-wage">Net wage (G/PP)</Label>
            <Input
              id="net-wage"
              type="number"
              min={0}
              step="any"
              value={Number.isFinite(netWage) ? netWage : 0}
              onChange={(e) => onNetWageChange(parseNumberInput(e.target.value, 0))}
            />
            {job.grossWage != null || job.incomeTaxRate != null ? (
              <p className="m-0 text-xs text-muted-foreground">
                {job.grossWage != null ? `Gross ${formatGold(job.grossWage, 4)}` : null}
                {job.grossWage != null && job.incomeTaxRate != null ? " · " : null}
                {job.incomeTaxRate != null
                  ? `tax ${formatGold(job.incomeTaxRate * 100, 1)}%`
                  : null}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="self-work-company">Self-work company</Label>
            <select
              id="self-work-company"
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={selfWorkCompanyId}
              onChange={(e) => onSelfWorkCompanyChange(e.target.value)}
            >
              <option value="">Best owned (auto)</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · AE{c.aeLevel} · {formatGold(c.profitPerPp, 3)} G/PP
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <h3 className="m-0 mb-2 text-sm font-medium text-muted-foreground">
            AE companies (active {income.activeSlots}/{companies.length})
          </h3>
          {companies.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">No companies loaded.</p>
          ) : (
            <ul className="m-0 list-none space-y-1.5 p-0">
              {companies
                .map((c) => ({
                  ...c,
                  daily: aeDaily(c.aeLevel, c.productionBonus, c.profitPerPp),
                  active: income.aeCompanyIds.includes(c.id),
                }))
                .toSorted((a, b) => b.daily - a.daily)
                .map((c) => (
                  <li
                    key={c.id}
                    className={
                      c.active
                        ? "flex justify-between gap-2 rounded-md border border-teal-500/30 bg-teal-500/10 px-2.5 py-1.5 text-sm"
                        : "flex justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5 text-sm text-muted-foreground"
                    }
                  >
                    <span>
                      {c.name}
                      {c.id === selfCompany?.id ? " · self-work" : null}
                    </span>
                    <span className="font-mono tabular-nums">
                      AE{c.aeLevel} · {formatGold(c.daily, 2)} G/day
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
