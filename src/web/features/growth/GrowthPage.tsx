import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { goldPerAePerDayFromProfit } from "@/growth/income";
import { planGrowthPath } from "@/growth/plan";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { api } from "../../api";
import { buildGrowthSearch } from "../../lib/growthSearch";
import { CompaniesPlayerSearch } from "../companies/CompaniesPlayerSearch";
import type {
  EditableFactory,
  FocusedPath,
  GrowthBootstrapResponse,
  GrowthPlanResult,
} from "./types";

const growthRoute = getRouteApi("/growth");

function formatItem(code: string): string {
  return code.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function formatTimeToGoal(result: GrowthPlanResult): string {
  if (result.stuck || (result.hitIterLimit && !result.complete)) return "stuck";
  if (!result.complete || result.timeToGoalHours == null) return "—";
  if (result.timeToGoalHours <= 0) return "done";
  const total = Math.round(result.timeToGoalHours);
  const days = Math.floor(total / 24);
  const hours = total % 24;
  if (days === 0) return `${hours}h`;
  return `${days}d ${hours}h`;
}

function pickFasterPath(
  optimal: GrowthPlanResult | null,
  upgradesOnly: GrowthPlanResult | null,
): FocusedPath {
  if (!optimal && !upgradesOnly) return "optimal";
  if (!optimal) return "upgrades_only";
  if (!upgradesOnly) return "optimal";

  const optimalOk = optimal.complete && !optimal.stuck && optimal.timeToGoalHours != null;
  const upgradesOk =
    upgradesOnly.complete && !upgradesOnly.stuck && upgradesOnly.timeToGoalHours != null;

  if (optimalOk && upgradesOk) {
    return optimal.timeToGoalHours! <= upgradesOnly.timeToGoalHours! ? "optimal" : "upgrades_only";
  }
  if (optimalOk) return "optimal";
  if (upgradesOk) return "upgrades_only";
  return "optimal";
}

function companiesToEditable(bootstrap: GrowthBootstrapResponse): EditableFactory[] {
  return bootstrap.companies.map((c) => ({
    id: c.id,
    name: c.name,
    aeLevel: c.aeLevel,
    goldPerAePerDay: c.goldPerAePerDay,
  }));
}

export function GrowthPage() {
  const search = growthRoute.useSearch();
  const navigate = growthRoute.useNavigate();
  const selectedUserId = search.userId ?? null;
  const selectedUsername = search.username ?? null;

  const [bootstrap, setBootstrap] = useState<GrowthBootstrapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [goalN, setGoalN] = useState(6);
  const [startBalance, setStartBalance] = useState(0);
  const [steel, setSteel] = useState(0);
  const [concrete, setConcrete] = useState(0);
  const [extraGoldPerDay, setExtraGoldPerDay] = useState(0);
  const [newItemCode, setNewItemCode] = useState("");
  const [bonus, setBonus] = useState(0);
  const [factories, setFactories] = useState<EditableFactory[]>([]);
  const [focusedOverride, setFocusedOverride] = useState<FocusedPath | null>(null);

  const displayName = selectedUsername ?? selectedUserId;

  function applyBootstrap(data: GrowthBootstrapResponse) {
    setBootstrap(data);
    setFocusedOverride(null);
    setGoalN(6);
    setStartBalance(data.startBalance);
    setSteel(data.steel);
    setConcrete(data.concrete);
    setExtraGoldPerDay(0);
    setNewItemCode(data.bestItem?.itemCode ?? data.opportunitiesLite[0]?.itemCode ?? "");
    setBonus(data.bestItem?.suggestedBonus ?? 0);
    setFactories(companiesToEditable(data));
  }

  async function loadBootstrap(userId: string, refresh = false) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ userId });
      if (refresh) qs.set("refresh", "1");
      const data = await api<GrowthBootstrapResponse>(`/api/growth/bootstrap?${qs}`);
      applyBootstrap(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBootstrap(null);
      setFactories([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!selectedUserId) {
      setBootstrap(null);
      setFactories([]);
      setFocusedOverride(null);
      return;
    }
    setFocusedOverride(null);
    void loadBootstrap(selectedUserId);
  }, [selectedUserId]);

  function selectPlayer(userId: string, username: string) {
    void navigate({
      search: buildGrowthSearch({ userId, username }),
      replace: true,
    });
  }

  const steelPrice = bootstrap?.prices.steel ?? null;
  const concretePrice = bootstrap?.prices.concrete ?? null;
  const pricesMissing =
    bootstrap != null &&
    (steelPrice == null || concretePrice == null || steelPrice <= 0 || concretePrice <= 0);

  const selectedProfitPerPp =
    bootstrap?.opportunitiesLite.find((o) => o.itemCode === newItemCode)?.profitPerPp ??
    bootstrap?.bestItem?.profitPerPp ??
    null;

  let optimalPlan: GrowthPlanResult | null = null;
  let upgradesOnlyPlan: GrowthPlanResult | null = null;

  if (bootstrap && !pricesMissing && selectedProfitPerPp != null) {
    const newFactoryGoldPerAePerDay = goldPerAePerDayFromProfit(selectedProfitPerPp, bonus);
    const shared = {
      factories: factories.map((f) => ({
        id: f.id,
        aeLevel: f.aeLevel,
        goldPerAePerDay: f.goldPerAePerDay,
      })),
      goalAe7Count: goalN,
      wallet: { gold: startBalance, steel, concrete },
      prices: {
        steel: steelPrice ?? 0,
        concrete: concretePrice ?? 0,
      },
      extraGoldPerDay,
      newFactoryGoldPerAePerDay,
    };
    optimalPlan = planGrowthPath({ ...shared, mode: "optimal" });
    upgradesOnlyPlan = planGrowthPath({ ...shared, mode: "upgrades_only" });
  }

  const focusedPath = focusedOverride ?? pickFasterPath(optimalPlan, upgradesOnlyPlan);
  const focusedPlan = focusedPath === "optimal" ? optimalPlan : upgradesOnlyPlan;

  function updateFactoryLevel(id: string, aeLevel: number) {
    setFactories((prev) =>
      prev.map((f) => (f.id === id ? { ...f, aeLevel: Math.min(7, Math.max(1, aeLevel)) } : f)),
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] rounded-md border border-border bg-card p-4 pb-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h1 className="mb-0.5 text-[1.35rem] font-semibold tracking-tight">Growth</h1>
          <p className="m-0 text-muted-foreground">
            Compare Optimal vs Upgrades-only paths to an N×AE7 goal. Chart and step log land in the
            next pass.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!selectedUserId || refreshing || loading}
          onClick={() => {
            if (selectedUserId) void loadBootstrap(selectedUserId, true);
          }}
        >
          {refreshing ? "Refreshing…" : "Refresh companies"}
        </Button>
      </div>

      {error ? <p className="my-2 text-destructive">{error}</p> : null}

      <section className="my-4 flex max-w-md flex-col gap-1.5">
        <label htmlFor="growth-user-search" className="text-sm text-muted-foreground">
          Find player
        </label>
        <CompaniesPlayerSearch selectedUserId={selectedUserId} onSelect={selectPlayer} />
      </section>

      {displayName ? (
        <p className="mb-3 text-muted-foreground">
          Planning for <strong className="text-foreground">{displayName}</strong>
          {bootstrap?.recordedAt
            ? ` · prices as of ${new Date(bootstrap.recordedAt).toLocaleString()}`
            : null}
          {bootstrap?.companiesFetchedAt
            ? ` · companies as of ${new Date(bootstrap.companiesFetchedAt).toLocaleString()}`
            : null}
        </p>
      ) : null}

      {loading ? <p className="text-muted-foreground">Loading growth bootstrap…</p> : null}

      {!selectedUserId && !loading ? (
        <p className="text-muted-foreground">
          Search for a player to load factories and plan paths.
        </p>
      ) : null}

      {bootstrap && !loading ? (
        <>
          {pricesMissing ? (
            <p className="my-2 text-destructive">
              Steel and/or Concrete market prices are missing or zero — refresh prices, then reload
              this player. Planning is paused until both prices are available.
            </p>
          ) : null}

          <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PathCard
              title="Optimal"
              description="May buy up to 12 companies as income accelerators."
              result={optimalPlan}
              active={focusedPath === "optimal"}
              onSelect={() => setFocusedOverride("optimal")}
            />
            <PathCard
              title="Upgrades-only"
              description="Buys only up to the goal count N; never beyond."
              result={upgradesOnlyPlan}
              active={focusedPath === "upgrades_only"}
              onSelect={() => setFocusedOverride("upgrades_only")}
            />
          </section>

          <section className="mt-5">
            <h2 className="mt-0 mb-2 text-[1.05rem] font-semibold">Overrides</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Field
                id="goal-n"
                label="Goal N (AE7 count)"
                type="number"
                min={1}
                max={12}
                value={goalN}
                onChange={(v) => setGoalN(Math.min(12, Math.max(1, Math.round(v))))}
              />
              <Field
                id="start-balance"
                label="Start gold"
                type="number"
                min={0}
                step="any"
                value={startBalance}
                onChange={setStartBalance}
              />
              <Field
                id="steel-inv"
                label="Steel inventory"
                type="number"
                min={0}
                step="any"
                value={steel}
                onChange={setSteel}
              />
              <Field
                id="concrete-inv"
                label="Concrete inventory"
                type="number"
                min={0}
                step="any"
                value={concrete}
                onChange={setConcrete}
              />
              <Field
                id="extra-gold"
                label="Extra gold / day"
                type="number"
                min={0}
                step="any"
                value={extraGoldPerDay}
                onChange={setExtraGoldPerDay}
              />
              <Field
                id="bonus"
                label="New co. bonus (fraction)"
                type="number"
                min={0}
                step={0.01}
                value={bonus}
                onChange={setBonus}
              />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-item">New company item</Label>
                <select
                  id="new-item"
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={newItemCode}
                  onChange={(e) => setNewItemCode(e.target.value)}
                >
                  {bootstrap.opportunitiesLite.length === 0 ? (
                    <option value="">No opportunities</option>
                  ) : null}
                  {bootstrap.opportunitiesLite.map((o) => (
                    <option key={o.itemCode} value={o.itemCode}>
                      {formatItem(o.itemCode)} ({o.profitPerPp.toFixed(4)} G/PP)
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Steel {steelPrice != null ? `${steelPrice} G` : "—"} · Concrete{" "}
              {concretePrice != null ? `${concretePrice} G` : "—"}
              {selectedProfitPerPp != null
                ? ` · new factory ${goldPerAePerDayFromProfit(selectedProfitPerPp, bonus).toFixed(3)} G/AE/day`
                : null}
            </p>
          </section>

          <section className="mt-6 rounded-md border border-dashed border-border px-3.5 py-3">
            <h2 className="mt-0 mb-1 text-[1.05rem] font-semibold">Chart</h2>
            <p className="m-0 text-sm text-muted-foreground">
              Placeholder — production curve for both paths (Task 6). Focused:{" "}
              <strong className="text-foreground">
                {focusedPath === "optimal" ? "Optimal" : "Upgrades-only"}
              </strong>
              {focusedPlan
                ? ` · ${focusedPlan.series.length} series points · ${formatTimeToGoal(focusedPlan)}`
                : " · no plan"}
            </p>
          </section>

          <section className="mt-4 rounded-md border border-dashed border-border px-3.5 py-3">
            <h2 className="mt-0 mb-1 text-[1.05rem] font-semibold">Step log</h2>
            <p className="m-0 text-sm text-muted-foreground">
              Placeholder — buy/upgrade guide for the focused path (Task 6).
              {focusedPlan
                ? ` ${focusedPlan.steps.length} steps ready · complete=${focusedPlan.complete} stuck=${focusedPlan.stuck}`
                : " No steps yet."}
            </p>
          </section>

          <section className="mt-4 rounded-md border border-dashed border-border px-3.5 py-3">
            <h2 className="mt-0 mb-2 text-[1.05rem] font-semibold">Factories</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              What-if AE levels ({factories.length} factories). Full list UI in Task 6.
            </p>
            {factories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No companies for this player.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {factories.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                    <span className="min-w-40 font-medium">{f.name}</span>
                    <span className="text-muted-foreground">
                      {f.goldPerAePerDay.toFixed(3)} G/AE/day
                    </span>
                    <Label htmlFor={`ae-${f.id}`} className="text-muted-foreground">
                      AE
                    </Label>
                    <Input
                      id={`ae-${f.id}`}
                      type="number"
                      min={1}
                      max={7}
                      className="w-20"
                      value={f.aeLevel}
                      onChange={(e) => updateFactoryLevel(f.id, Number(e.target.value) || 1)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function PathCard({
  title,
  description,
  result,
  active,
  onSelect,
}: {
  title: string;
  description: string;
  result: GrowthPlanResult | null;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" onClick={onSelect} className="text-left">
      <Card
        className={cn(
          "gap-0 border-border bg-secondary py-0 shadow-none transition-colors",
          active && "ring-2 ring-primary/50",
        )}
      >
        <CardHeader className="px-3.5 pt-3 pb-1">
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
        </CardHeader>
        <CardContent className="px-3.5 pb-3">
          <p className="m-0 text-2xl font-semibold tracking-tight">
            {result ? formatTimeToGoal(result) : "—"}
          </p>
          <p className="mt-1 mb-0 text-sm text-muted-foreground">{description}</p>
          {result ? (
            <p className="mt-1.5 mb-0 text-xs text-muted-foreground">
              {result.steps.length} steps
              {result.complete ? " · reaches goal" : null}
              {result.stuck ? " · stuck" : null}
              {result.hitIterLimit ? " · hit iter limit" : null}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </button>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  min,
  max,
  step,
}: {
  id: string;
  label: string;
  type: "number";
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number | "any";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
