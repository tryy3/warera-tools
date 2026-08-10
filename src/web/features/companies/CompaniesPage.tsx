import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useCallback, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { skillValueFromLevel } from "@/skills/values";
import { wagePair } from "../../../economy/workers";
import { api } from "../../api";
import { FlagIcon } from "../../components/FlagIcon";
import { GoldIcon } from "../../components/GoldIcon";
import { ItemIcon } from "../../components/ItemIcon";
import { buildCompaniesSearch } from "../../lib/companiesSearch";
import { usePlayerSelection } from "../../player/PlayerSelectionContext";
import { useSyncPlayerSearch } from "../../player/useSyncPlayerSearch";
import { queryKeys } from "../../query/keys";
import { useCompaniesQuery } from "../../query/useCompaniesQuery";
import { useUserQuery } from "../../query/useUserQuery";
import { CompanyCardSummary } from "./CompanyCardSummary";
import { CompanyDailyBreakdown } from "./CompanyDailyBreakdown";
import { CompanyParametersForm } from "./CompanyParametersForm";
import { MarketOpportunitiesTable } from "./MarketOpportunitiesTable";
import { MoveWorkerModal } from "./MoveWorkerModal";
import { SimWorkerModal, type SimWorkerDraft } from "./SimWorkerModal";
import type { DerivedCompanyCard } from "./sim/derive";
import { CompanySimProvider, useCompanySim, type OwnerDefaults } from "./sim/CompanySimProvider";
import type { SimWorker } from "./sim/types";
import { ItemPriceBoardProvider, useItemPriceBoard } from "./sessionPrices/ItemPriceBoardProvider";
import type { AdvisorResponse, CompanyAdvisorRow } from "./types";
import { WorkerRowActions } from "./WorkerRowActions";

function draftFromWorker(worker: SimWorker): SimWorkerDraft {
  return {
    name: worker.name,
    wagePerPp: worker.wagePerPp,
    fidelityPct: worker.fidelityPct,
    energyLevel: worker.energyLevel,
    productionLevel: worker.productionLevel,
    activeFromStart: worker.assignment != null,
  };
}

function defaultCreateDraft(simCount: number): SimWorkerDraft {
  return {
    name: `Sim Worker ${simCount + 1}`,
    wagePerPp: 0.1,
    fidelityPct: 0,
    energyLevel: 5,
    productionLevel: 5,
    activeFromStart: true,
  };
}

const companiesRoute = getRouteApi("/companies");

function formatNum(value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatDisplayNumber(value, digits);
}

function formatItem(code: string): string {
  return code.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
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

function FormulaDetails({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group mt-2 rounded border border-dashed border-primary/35 bg-black/20 px-2.5 py-1.5">
      <summary className="cursor-pointer list-none text-[0.75em] tracking-wider text-primary uppercase [&::-webkit-details-marker]:hidden">
        <span className="inline-block transition-transform group-open:rotate-90">▸ </span>
        {label}
      </summary>
      <div className="pb-1 [&_.mt-2:first-child]:mt-1.5">{children}</div>
    </details>
  );
}

function SectionPlaceholder({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group mt-2 rounded border border-border bg-black/15 px-2.5 py-1.5"
    >
      <summary className="cursor-pointer list-none text-[0.75em] tracking-wider text-muted-foreground uppercase [&::-webkit-details-marker]:hidden">
        <span className="inline-block transition-transform group-open:rotate-90">▸ </span>
        {label}
      </summary>
      <div className="pt-1.5 pb-1 text-sm text-muted-foreground">{children ?? "Coming soon."}</div>
    </details>
  );
}

function GoldAmount({
  value,
  digits = 4,
  prefix = "",
  suffix = "",
}: {
  value: number | null | undefined;
  digits?: number;
  prefix?: string;
  suffix?: string;
}) {
  if (value == null || !Number.isFinite(value)) return "—";
  return (
    <span className="inline-flex items-center gap-1.5">
      <GoldIcon />
      {prefix}
      {formatDisplayNumber(value, digits)}
      {suffix}
    </span>
  );
}

function PortfolioNetBanner() {
  const { portfolioNet } = useCompanySim();
  const sign = portfolioNet > 0 ? "+" : "";
  return (
    <p className="mb-2 flex flex-wrap items-center gap-1.5 text-sm">
      <span className="tracking-wide text-muted-foreground uppercase">Portfolio net</span>
      <span className="inline-flex items-center gap-1.5 font-medium text-success">
        <GoldIcon />
        {sign}
        {formatDisplayNumber(portfolioNet, 3)}/day
      </span>
    </p>
  );
}

function GoldAmountInline({
  value,
  digits = 3,
  className,
}: {
  value: number | null | undefined;
  digits?: number;
  className?: string;
}) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      <GoldIcon />
      {sign}
      {formatDisplayNumber(value, digits)}
    </span>
  );
}

function workersForCompany(workers: SimWorker[], companyId: string): SimWorker[] {
  return workers.filter((w) => w.assignment === companyId);
}

function WorkerListItem({
  worker,
  incomeTaxRate,
  day,
  assigned,
  onEdit,
  onToggleActive,
  onMove,
}: {
  worker: SimWorker;
  incomeTaxRate: number;
  day?: DerivedCompanyCard["day"]["workers"][number];
  assigned: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onMove: () => void;
}) {
  const wage = wagePair(worker.wagePerPp, incomeTaxRate);
  return (
    <li
      className={`rounded border border-border/70 bg-black/20 px-2.5 py-2 ${
        assigned ? "" : "opacity-70"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-foreground">{worker.name}</span>
            {worker.kind === "simulated" ? (
              <Badge variant="outline" className="font-normal">
                Simulated
              </Badge>
            ) : null}
            {!assigned ? (
              <Badge
                variant="outline"
                className="border-muted-foreground/40 font-normal text-muted-foreground"
              >
                Inactive
              </Badge>
            ) : null}
            {worker.enrichmentError ? (
              <Badge
                variant="outline"
                className="border-destructive/50 font-normal text-destructive"
              >
                Error
              </Badge>
            ) : null}
            {!worker.enrichmentError && worker.assumedFields.length > 0 ? (
              <Badge
                variant="outline"
                className="border-amber-500/40 font-normal text-amber-200/90"
              >
                Assumed
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 mb-0 text-[0.8em] text-muted-foreground">
            Energy Lv {worker.energyLevel} (
            {formatNum(skillValueFromLevel("energy", worker.energyLevel), 0)}) · Prod Lv{" "}
            {worker.productionLevel} (
            {formatNum(skillValueFromLevel("production", worker.productionLevel), 0)}) · Fid{" "}
            {formatNum(worker.fidelityPct, 0)}%
          </p>
        </div>
        <WorkerRowActions
          assigned={assigned}
          onEdit={onEdit}
          onToggleActive={onToggleActive}
          onMove={onMove}
        />
      </div>
      <dl className="m-0 mt-1.5 grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-x-3 gap-y-1 text-sm">
        <div>
          <dt className="m-0 text-[0.7em] tracking-wide text-muted-foreground uppercase">Wage</dt>
          <dd className="mt-0.5 mb-0 inline-flex items-center gap-1 text-amber-200">
            <GoldIcon />
            <span title="Gross (excl. tax)">{formatNum(wage.gross, 4)}</span>
            <span className="text-muted-foreground">|</span>
            <span className="text-amber-200/55" title="Net (after tax)">
              {formatNum(wage.net, 4)}
            </span>
          </dd>
        </div>
        <div>
          <dt className="m-0 text-[0.7em] tracking-wide text-muted-foreground uppercase">
            Daily cost
          </dt>
          <dd className="mt-0.5 mb-0">
            <GoldAmountInline
              value={day?.current.ownerCostPerDay}
              digits={3}
              className="text-destructive"
            />
          </dd>
        </div>
        <div>
          <dt className="m-0 text-[0.7em] tracking-wide text-muted-foreground uppercase">
            Profit now
          </dt>
          <dd className="mt-0.5 mb-0">
            <GoldAmountInline
              value={day?.current.contributionPerDay}
              digits={3}
              className="text-success"
            />
          </dd>
        </div>
        <div>
          <dt className="m-0 text-[0.7em] tracking-wide text-muted-foreground uppercase">
            Profit @10%
          </dt>
          <dd className="mt-0.5 mb-0">
            <GoldAmountInline
              value={day?.atMaxFidelity.contributionPerDay}
              digits={3}
              className="text-success"
            />
          </dd>
        </div>
      </dl>
    </li>
  );
}

function CompanyWorkersSection({
  row,
  summary,
  companyOptions,
}: {
  row: CompanyAdvisorRow;
  summary: DerivedCompanyCard;
  companyOptions: { id: string; name: string }[];
}) {
  const { state, dispatch } = useCompanySim();
  const companyId = row.company.id;
  const workers = workersForCompany(state.workers, companyId);
  const dayById = new Map(summary.day.workers.map((w) => [w.id, w]));

  const [createOpen, setCreateOpen] = useState(false);
  const [editWorker, setEditWorker] = useState<SimWorker | null>(null);
  const [moveWorker, setMoveWorker] = useState<SimWorker | null>(null);

  const simCount = state.workers.filter((w) => w.kind === "simulated").length;

  function handleCreate(draft: SimWorkerDraft) {
    const worker: SimWorker = {
      id: `sim-${crypto.randomUUID()}`,
      kind: "simulated",
      name: draft.name,
      assignment: draft.activeFromStart ? companyId : null,
      wagePerPp: draft.wagePerPp,
      energyLevel: draft.energyLevel,
      productionLevel: draft.productionLevel,
      fidelityPct: draft.fidelityPct,
      assumedFields: [],
      dirty: true,
      enrichmentError: false,
    };
    dispatch({ type: "addSimWorker", worker });
    setCreateOpen(false);
  }

  function handleEdit(draft: SimWorkerDraft) {
    if (!editWorker) return;
    dispatch({
      type: "updateWorker",
      id: editWorker.id,
      patch: {
        name: draft.name,
        wagePerPp: draft.wagePerPp,
        energyLevel: draft.energyLevel,
        productionLevel: draft.productionLevel,
        fidelityPct: draft.fidelityPct,
      },
    });
    setEditWorker(null);
  }

  return (
    <>
      <SectionPlaceholder label="Workers" defaultOpen>
        {summary.workersStatus === "unavailable" ? (
          <p className="m-0 mb-2 text-sm text-muted-foreground">
            Live workers unavailable for this company. Simulated workers still apply.
          </p>
        ) : null}

        {workers.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">No workers assigned.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {workers.map((worker) => (
              <WorkerListItem
                key={worker.id}
                worker={worker}
                incomeTaxRate={summary.incomeTaxRate}
                day={dayById.get(worker.id)}
                assigned
                onEdit={() => setEditWorker(worker)}
                onToggleActive={() =>
                  dispatch({
                    type: "setAssignment",
                    id: worker.id,
                    assignment: null,
                  })
                }
                onMove={() => setMoveWorker(worker)}
              />
            ))}
          </ul>
        )}

        <div className="mt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            + Add simulated worker
          </Button>
        </div>
      </SectionPlaceholder>

      <SimWorkerModal
        open={createOpen}
        mode="create"
        initial={defaultCreateDraft(simCount)}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
      <SimWorkerModal
        open={editWorker != null}
        mode="edit"
        initial={editWorker ? draftFromWorker(editWorker) : defaultCreateDraft(0)}
        onClose={() => setEditWorker(null)}
        onSubmit={handleEdit}
      />
      <MoveWorkerModal
        open={moveWorker != null}
        workerName={moveWorker?.name ?? ""}
        companies={companyOptions}
        currentAssignment={moveWorker?.assignment ?? null}
        onClose={() => setMoveWorker(null)}
        onSubmit={(assignment) => {
          if (!moveWorker) return;
          dispatch({ type: "setAssignment", id: moveWorker.id, assignment });
          setMoveWorker(null);
        }}
      />
    </>
  );
}

function UnassignedWorkersPool({
  companyOptions,
  defaultIncomeTaxRate,
}: {
  companyOptions: { id: string; name: string }[];
  defaultIncomeTaxRate: number;
}) {
  const { state, dispatch, cards } = useCompanySim();
  const unassigned = state.workers.filter((w) => w.assignment === null);

  const [editWorker, setEditWorker] = useState<SimWorker | null>(null);
  const [moveWorker, setMoveWorker] = useState<SimWorker | null>(null);

  function handleEdit(draft: SimWorkerDraft) {
    if (!editWorker) return;
    dispatch({
      type: "updateWorker",
      id: editWorker.id,
      patch: {
        name: draft.name,
        wagePerPp: draft.wagePerPp,
        energyLevel: draft.energyLevel,
        productionLevel: draft.productionLevel,
        fidelityPct: draft.fidelityPct,
      },
    });
    setEditWorker(null);
  }

  if (unassigned.length === 0) return null;

  // Prefer tax rate from any card; fall back to first company default.
  const incomeTaxRate = cards[0]?.incomeTaxRate ?? defaultIncomeTaxRate;

  return (
    <>
      <Card className="mb-3 gap-0 border-border bg-secondary py-0 shadow-none">
        <CardHeader className="px-3.5 pt-3 pb-2">
          <h3 className="text-base font-semibold">Unassigned</h3>
          <p className="mt-0.5 mb-0 text-sm text-muted-foreground">
            Inactive workers. Activate or move them onto a company.
          </p>
        </CardHeader>
        <CardContent className="px-3.5 pb-3">
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {unassigned.map((worker) => (
              <WorkerListItem
                key={worker.id}
                worker={worker}
                incomeTaxRate={incomeTaxRate}
                assigned={false}
                onEdit={() => setEditWorker(worker)}
                onToggleActive={() => setMoveWorker(worker)}
                onMove={() => setMoveWorker(worker)}
              />
            ))}
          </ul>
        </CardContent>
      </Card>

      <SimWorkerModal
        open={editWorker != null}
        mode="edit"
        initial={editWorker ? draftFromWorker(editWorker) : defaultCreateDraft(0)}
        onClose={() => setEditWorker(null)}
        onSubmit={handleEdit}
      />
      <MoveWorkerModal
        open={moveWorker != null}
        workerName={moveWorker?.name ?? ""}
        companies={companyOptions}
        currentAssignment={moveWorker?.assignment ?? null}
        onClose={() => setMoveWorker(null)}
        onSubmit={(assignment) => {
          if (!moveWorker) return;
          dispatch({ type: "setAssignment", id: moveWorker.id, assignment });
          setMoveWorker(null);
        }}
      />
    </>
  );
}

function CompanyCard({
  row,
  companies,
  companyOptions,
  ownerDefaults,
}: {
  row: CompanyAdvisorRow;
  companies: CompanyAdvisorRow[];
  companyOptions: { id: string; name: string }[];
  ownerDefaults: OwnerDefaults;
}) {
  const { cards, state } = useCompanySim();
  const summary = cards.find((c) => c.companyId === row.company.id);
  if (!summary) return null;

  const companyId = row.company.id;
  const overrides = state.overrides[companyId];
  const aeLevel = overrides?.aeLevel ?? row.company.aeLevel;
  const productionBonus = overrides?.productionBonus ?? row.company.productionBonus ?? 0;
  const entrepreneurshipLevel =
    overrides?.entrepreneurshipLevel ?? ownerDefaults.entrepreneurshipLevel;
  const productionSkillLevel =
    overrides?.productionSkillLevel ?? ownerDefaults.productionSkillLevel;
  const includeSelfWork = overrides?.includeSelfWork ?? false;

  const assumedWorkerFields = state.workers
    .filter((w) => w.assignment === companyId)
    .flatMap((w) => w.assumedFields);

  return (
    <Card className="gap-0 border-border bg-secondary py-0 shadow-none">
      <CardHeader className="px-3.5 pt-3 pb-2">
        <CompanyCardSummary
          row={row}
          summary={summary}
          aeLevel={aeLevel}
          productionBonus={productionBonus}
        />
      </CardHeader>

      <CardContent className="px-3.5 pb-3">
        <SectionPlaceholder label="Parameters">
          <CompanyParametersForm
            companyId={companyId}
            companies={companies}
            aeLevel={aeLevel}
            productionBonus={productionBonus}
            entrepreneurshipLevel={entrepreneurshipLevel}
            productionSkillLevel={productionSkillLevel}
            includeSelfWork={includeSelfWork}
          />
        </SectionPlaceholder>
        <CompanyWorkersSection row={row} summary={summary} companyOptions={companyOptions} />
        <SectionPlaceholder label="Daily breakdown">
          <CompanyDailyBreakdown
            day={summary.day}
            incomeTaxAssumed={summary.incomeTaxAssumed}
            assumedWorkerFields={assumedWorkerFields}
          />
        </SectionPlaceholder>

        {row.bonusDetails || row.profitBreakdown || row.aeBreakdown ? (
          <FormulaDetails label="How calculated">
            {row.bonusDetails ? (
              <FormulaBox label="Production bonus">{row.bonusDetails.formula}</FormulaBox>
            ) : null}
            {row.profitBreakdown ? (
              <FormulaBox label="Profit / PP">{row.profitBreakdown.formula}</FormulaBox>
            ) : null}
            {row.aeBreakdown ? (
              <FormulaBox label="AE / day">{`${row.aeBreakdown.formula} = ${formatNum(row.aeBreakdown.dailyValue, 4)} G`}</FormulaBox>
            ) : null}
          </FormulaDetails>
        ) : null}

        {row.bestSwitch ? (
          <div className="mt-3 border-t border-border pt-2.5">
            <div className="mb-1 text-[0.8em] tracking-wider text-primary uppercase">
              Best switch (raw)
            </div>
            <div className="mb-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[0.95em] leading-snug">
              <span className="text-muted-foreground">→</span>
              <span className="inline-flex items-center gap-1.5">
                <ItemIcon itemCode={row.bestSwitch.itemCode} />
                <strong>{formatItem(row.bestSwitch.itemCode)}</strong>
              </span>
              {row.bestSwitch.bestRegionName || row.bestSwitch.bestRegionId ? (
                <>
                  <span className="text-muted-foreground">@</span>
                  <span className="inline-flex items-center gap-1.5">
                    <FlagIcon code={row.bestSwitch.bestRegionCountryCode} />
                    {row.bestSwitch.bestRegionName ?? row.bestSwitch.bestRegionId}
                  </span>
                </>
              ) : (
                <span>(same region)</span>
              )}
              <span className="text-muted-foreground">
                (+{formatNum(row.bestSwitch.bestBonus * 100, 1)}% bonus)
              </span>
            </div>
            <dl className="mt-1.5 m-0 grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-x-3.5 gap-y-1.5">
              <div>
                <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                  Δ / day
                </dt>
                <dd className="mt-0.5 mb-0 text-success">
                  +{formatNum(row.bestSwitch.dailyDelta, 2)} G
                </dd>
              </div>
              <div>
                <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                  Transfer
                </dt>
                <dd className="mt-0.5 mb-0 flex flex-col items-start gap-0.5">
                  <span>{row.bestSwitch.transferConcrete} Concrete</span>
                  <span className="text-[0.92em] text-muted-foreground">
                    ~ <GoldAmount value={row.bestSwitch.transferGold} digits={1} />
                  </span>
                </dd>
              </div>
              <div>
                <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                  Payback
                </dt>
                <dd className="mt-0.5 mb-0">
                  {row.bestSwitch.paybackDays != null
                    ? `${formatNum(row.bestSwitch.paybackDays, 1)}d`
                    : "—"}
                </dd>
              </div>
            </dl>
            <FormulaDetails label="Switch math">
              <FormulaBox label="Alt Profit / PP">{row.bestSwitch.profitFormula}</FormulaBox>
              <FormulaBox label="Alt AE / day">{row.bestSwitch.aeFormula}</FormulaBox>
              <FormulaBox label="Transfer cost">{row.bestSwitch.transferFormula}</FormulaBox>
              {row.bestSwitch.paybackFormula ? (
                <FormulaBox label="Payback">{row.bestSwitch.paybackFormula}</FormulaBox>
              ) : null}
            </FormulaDetails>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No profitable switch found with current prices.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CompaniesList({
  companies,
  ownerDefaults,
}: {
  companies: CompanyAdvisorRow[];
  ownerDefaults: OwnerDefaults;
}) {
  const companyOptions = companies.map((row) => ({
    id: row.company.id,
    name: row.company.name,
  }));
  const defaultIncomeTaxRate = companies[0]?.incomeTaxRate ?? 0;
  return (
    <>
      <PortfolioNetBanner />
      <UnassignedWorkersPool
        companyOptions={companyOptions}
        defaultIncomeTaxRate={defaultIncomeTaxRate}
      />
      <div className="flex flex-col gap-3">
        {companies.map((row) => (
          <CompanyCard
            key={row.company.id}
            row={row}
            companies={companies}
            companyOptions={companyOptions}
            ownerDefaults={ownerDefaults}
          />
        ))}
      </div>
    </>
  );
}

export function CompaniesPage() {
  const search = companiesRoute.useSearch();
  const navigate = companiesRoute.useNavigate();
  const queryClient = useQueryClient();
  const { player } = usePlayerSelection();

  const syncNavigate = useCallback(
    (opts: { search: { userId?: string; username?: string }; replace: boolean }) =>
      navigate({
        search: buildCompaniesSearch({
          userId: opts.search.userId ?? null,
          username: opts.search.username ?? null,
        }),
        replace: opts.replace,
      }),
    [navigate],
  );

  useSyncPlayerSearch({
    userId: search.userId,
    username: search.username,
    navigate: syncNavigate,
  });

  const companiesQuery = useCompaniesQuery(player?.userId ?? null);
  const userQuery = useUserQuery(player?.userId ?? null);
  const advisor = companiesQuery.data ?? null;

  const ownerDefaults = {
    entrepreneurshipLevel: userQuery.data?.skills.entrepreneurship?.level ?? 0,
    productionSkillLevel: userQuery.data?.skills.production?.level ?? 0,
  };

  const [polling, setPolling] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);

  const queryError =
    companiesQuery.error instanceof Error
      ? companiesQuery.error.message
      : companiesQuery.isError
        ? String(companiesQuery.error)
        : null;
  const error = pollError ?? queryError;

  async function refreshPrices() {
    setPolling(true);
    setPollError(null);
    try {
      await api("/api/prices/poll", { method: "POST" });
      if (player?.userId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.companies(player.userId) });
      }
    } catch (err) {
      setPollError(err instanceof Error ? err.message : String(err));
    } finally {
      setPolling(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] rounded-md border border-border bg-card p-4 pb-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h1 className="mb-0.5 text-[1.35rem] font-semibold tracking-tight">Companies</h1>
          <p className="m-0 text-muted-foreground">
            AE daily value = AE level × (1 + production bonus) × 24h × Profit/PP. Formulas shown per
            company.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={polling}
          onClick={() => void refreshPrices()}
        >
          {polling ? "Refreshing…" : "Refresh prices"}
        </Button>
      </div>

      {error ? <p className="my-2 text-destructive">{error}</p> : null}

      {player ? (
        <div className="mb-2">
          <p className="m-0 min-w-64 text-muted-foreground">
            Showing companies for <strong className="text-foreground">{player.username}</strong>
            {advisor?.recordedAt
              ? ` · prices as of ${new Date(advisor.recordedAt).toLocaleString()}`
              : null}
            {advisor?.companiesFetchedAt
              ? ` · companies as of ${new Date(advisor.companiesFetchedAt).toLocaleString()}`
              : null}
          </p>
        </div>
      ) : null}

      {companiesQuery.isFetching ? <p className="text-muted-foreground">Loading advisor…</p> : null}

      <ItemPriceBoardProvider
        key={player?.userId ?? "none"}
        liveOpportunities={advisor?.opportunities ?? []}
      >
        <CompaniesWorkspace
          playerLoaded={player != null}
          advisor={advisor}
          ownerDefaults={ownerDefaults}
          liveRevision={companiesQuery.dataUpdatedAt}
          queryError={queryError}
          isFetching={companiesQuery.isFetching}
          playerUserId={player?.userId ?? null}
        />
      </ItemPriceBoardProvider>
    </div>
  );
}

function CompaniesWorkspace({
  playerLoaded,
  advisor,
  ownerDefaults,
  liveRevision,
  queryError,
  isFetching,
  playerUserId,
}: {
  playerLoaded: boolean;
  advisor: AdvisorResponse | null;
  ownerDefaults: OwnerDefaults;
  liveRevision: number;
  queryError: string | null;
  isFetching: boolean;
  playerUserId: string | null;
}) {
  const board = useItemPriceBoard();
  const referenceAe = advisor?.opportunities[0]?.referenceAeLevel ?? 6;

  return (
    <div className="mt-3 grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_0.8fr]">
      <section>
        <h2 className="mt-0 mb-2 text-[1.05rem] font-semibold">Companies</h2>
        {!playerLoaded ? (
          <p className="text-muted-foreground">Load a player in the header.</p>
        ) : !advisor && !isFetching ? (
          <p className="text-muted-foreground">{queryError ?? "Use Load in the header."}</p>
        ) : null}
        {advisor?.companies.length === 0 ? (
          <p className="text-muted-foreground">No companies found for this user.</p>
        ) : null}
        {advisor && playerLoaded && playerUserId ? (
          <CompanySimProvider
            key={playerUserId}
            companies={advisor.companies}
            ownerDefaults={ownerDefaults}
            liveRevision={liveRevision}
            bookPrices={board.effectiveBook}
          >
            <CompaniesList companies={advisor.companies} ownerDefaults={ownerDefaults} />
          </CompanySimProvider>
        ) : null}
      </section>

      <section>
        <h2 className="mt-0 mb-2 text-[1.05rem] font-semibold">Market opportunities</h2>
        <p className="mb-2 text-sm text-muted-foreground">
          Ranked by Profit/PP = (sell − Σ buy inputs) / consumed PP. Click a row to set session
          buy/sell for that item (shared across companies). ~G/day uses AE {referenceAe} × each
          item’s best known region bonus.
        </p>
        <MarketOpportunitiesTable />
      </section>
    </div>
  );
}
