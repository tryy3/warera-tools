import { getRouteApi } from "@tanstack/react-router";
import {
  ArrowUpCircle,
  CalendarDays,
  Coins,
  Factory,
  Gauge,
  Settings2,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { goldPerAePerDayFromProfit } from "@/growth/income";
import { DEFAULT_MAX_ITERATIONS, planGrowthPath } from "@/growth/plan";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { GoldIcon } from "../../components/GoldIcon";
import { ItemIcon } from "../../components/ItemIcon";
import { buildGrowthSearch } from "../../lib/growthSearch";
import { usePlayerSelection } from "../../player/PlayerSelectionContext";
import { useSyncPlayerSearch } from "../../player/useSyncPlayerSearch";
import { useGrowthBootstrapQuery } from "../../query/useGrowthBootstrapQuery";
import { formatItem } from "../market/formatItem";
import { formatGold, formatPlanStatus } from "./format";
import { GrowthFactoryList } from "./GrowthFactoryList";
import { GrowthPathChart } from "./GrowthPathChart";
import { GrowthStepLog } from "./GrowthStepLog";
import { PATH_THEME } from "./pathTheme";
import type {
  EditableFactory,
  FocusedPath,
  GrowthBootstrapResponse,
  GrowthPlanResult,
} from "./types";

const growthRoute = getRouteApi("/growth");

const PATH_ORDER = ["cheapest", "income_roi", "upgrade_first"] as const satisfies FocusedPath[];

function pickFasterPath(plans: Record<FocusedPath, GrowthPlanResult | null>): FocusedPath {
  let best: FocusedPath = "cheapest";
  let bestTime = Number.POSITIVE_INFINITY;
  let found = false;
  for (const key of PATH_ORDER) {
    const plan = plans[key];
    if (!plan?.complete || plan.stuck || plan.timeToGoalHours == null) continue;
    found = true;
    if (plan.timeToGoalHours < bestTime) {
      bestTime = plan.timeToGoalHours;
      best = key;
    }
  }
  return found ? best : "cheapest";
}

function companiesToEditable(bootstrap: GrowthBootstrapResponse): EditableFactory[] {
  return bootstrap.companies.map((c) => ({
    id: c.id,
    name: c.name,
    itemCode: c.itemCode,
    aeLevel: c.aeLevel,
    goldPerAePerDay: c.goldPerAePerDay,
  }));
}

function parseNumberInput(raw: string, fallback = 0): number {
  if (raw === "" || raw === "-" || raw === "." || raw === "-.") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function GrowthPage() {
  const search = growthRoute.useSearch();
  const navigate = growthRoute.useNavigate();
  const { player } = usePlayerSelection();

  const syncNavigate = useCallback(
    (opts: { search: { userId?: string; username?: string }; replace: boolean }) =>
      navigate({
        search: buildGrowthSearch({
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

  const bootstrapQuery = useGrowthBootstrapQuery(player?.userId ?? null);

  const [bootstrap, setBootstrap] = useState<GrowthBootstrapResponse | null>(null);
  const appliedKeyRef = useRef<string | null>(null);

  const [goalN, setGoalN] = useState(6);
  const [startBalance, setStartBalance] = useState(0);
  const [steel, setSteel] = useState(0);
  const [concrete, setConcrete] = useState(0);
  const [extraGoldPerDay, setExtraGoldPerDay] = useState(0);
  const [newItemCode, setNewItemCode] = useState("");
  const [bonus, setBonus] = useState(0);
  const [maxIterations, setMaxIterations] = useState(DEFAULT_MAX_ITERATIONS);
  const [factories, setFactories] = useState<EditableFactory[]>([]);
  const [focusedOverride, setFocusedOverride] = useState<FocusedPath | null>(null);

  const queryError =
    bootstrapQuery.error instanceof Error
      ? bootstrapQuery.error.message
      : bootstrapQuery.isError
        ? String(bootstrapQuery.error)
        : null;

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
    setMaxIterations(DEFAULT_MAX_ITERATIONS);
    setFactories(companiesToEditable(data));
  }

  useEffect(() => {
    const data = bootstrapQuery.data;
    const userId = player?.userId;
    if (!data || !userId) {
      if (!userId) {
        setBootstrap(null);
        setFactories([]);
        setFocusedOverride(null);
        appliedKeyRef.current = null;
      } else if (!data) {
        setBootstrap(null);
        setFactories([]);
        appliedKeyRef.current = null;
      }
      return;
    }
    const key = `${userId}:${bootstrapQuery.dataUpdatedAt}`;
    if (appliedKeyRef.current === key) return;
    appliedKeyRef.current = key;
    applyBootstrap(data);
  }, [bootstrapQuery.data, bootstrapQuery.dataUpdatedAt, player?.userId]);

  const loading = bootstrapQuery.isFetching && !bootstrap;

  const steelPrice = bootstrap?.prices.steel ?? null;
  const concretePrice = bootstrap?.prices.concrete ?? null;
  const pricesMissing =
    bootstrap != null &&
    (steelPrice == null || concretePrice == null || steelPrice <= 0 || concretePrice <= 0);

  const selectedProfitPerPp =
    bootstrap?.opportunitiesLite.find((o) => o.itemCode === newItemCode)?.profitPerPp ??
    bootstrap?.bestItem?.profitPerPp ??
    null;

  const plans: Record<FocusedPath, GrowthPlanResult | null> = {
    cheapest: null,
    income_roi: null,
    upgrade_first: null,
  };

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
      maxIterations,
    };
    for (const mode of PATH_ORDER) {
      plans[mode] = planGrowthPath({ ...shared, mode });
    }
  }

  const focusedPath = focusedOverride ?? pickFasterPath(plans);
  const focusedPlan = plans[focusedPath];
  const newFactoryDaily =
    selectedProfitPerPp != null ? goldPerAePerDayFromProfit(selectedProfitPerPp, bonus) : null;

  function updateFactoryLevel(id: string, aeLevel: number) {
    setFactories((prev) =>
      prev.map((f) => (f.id === id ? { ...f, aeLevel: Math.min(7, Math.max(1, aeLevel)) } : f)),
    );
  }

  function removeFactory(id: string) {
    setFactories((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 pb-8">
      <header className="relative overflow-hidden rounded-2xl border border-border bg-card px-5 py-5">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(ellipse 50% 80% at 0% 0%, rgba(45,212,191,0.12), transparent 55%), radial-gradient(ellipse 45% 70% at 100% 0%, rgba(251,191,36,0.12), transparent 50%)",
          }}
          aria-hidden
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
              <Sparkles className="size-3.5 text-teal-300" aria-hidden />
              Factory race
            </p>
            <h1 className="mb-1 text-2xl font-semibold tracking-tight">Growth planner</h1>
            <p className="m-0 max-w-xl text-sm text-muted-foreground">
              Pick a goal like {goalN}×AE7, then compare Cheapest-first, Income ROI, and
              Upgrade-first (AE7 ASAP).
            </p>
          </div>
        </div>
      </header>

      {queryError ? <p className="text-destructive">{queryError}</p> : null}

      {player ? (
        <p className="text-sm text-muted-foreground">
          Planning for <strong className="text-foreground">{player.username}</strong>
        </p>
      ) : null}

      {loading ? <p className="text-muted-foreground">Loading factories…</p> : null}

      {!player && !loading ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-muted-foreground">
          Load a player in the header.
        </p>
      ) : null}

      {bootstrap && !loading ? (
        <>
          {pricesMissing ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Steel and/or Concrete prices are missing — use Refresh prices on Companies, then Load
              or Refresh in the header.
            </p>
          ) : null}

          <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <PathCard
              path="cheapest"
              icon={<Wallet className="size-5" aria-hidden />}
              result={plans.cheapest}
              active={focusedPath === "cheapest"}
              onSelect={() => setFocusedOverride("cheapest")}
            />
            <PathCard
              path="income_roi"
              icon={<TrendingUp className="size-5" aria-hidden />}
              result={plans.income_roi}
              active={focusedPath === "income_roi"}
              onSelect={() => setFocusedOverride("income_roi")}
            />
            <PathCard
              path="upgrade_first"
              icon={<ArrowUpCircle className="size-5" aria-hidden />}
              result={plans.upgrade_first}
              active={focusedPath === "upgrade_first"}
              onSelect={() => setFocusedOverride("upgrade_first")}
            />
          </section>

          <section className="rounded-xl border border-border bg-card/80 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Target className="size-4 text-sky-300" aria-hidden />
              <h2 className="m-0 text-base font-semibold">Goal & assumptions</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Field
                id="goal-n"
                label="Goal (×AE7)"
                icon={<Factory className="size-3.5" aria-hidden />}
                type="number"
                min={1}
                max={12}
                value={goalN}
                onChange={(v) => setGoalN(Math.min(12, Math.max(1, Math.round(v))))}
              />
              <Field
                id="start-balance"
                label="Start gold"
                icon={<GoldIcon className="size-3.5" />}
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
                icon={<Coins className="size-3.5" aria-hidden />}
                type="number"
                min={0}
                step="any"
                value={extraGoldPerDay}
                onChange={setExtraGoldPerDay}
              />
              <Field
                id="bonus"
                label="New co. bonus"
                type="number"
                min={0}
                step={0.01}
                value={bonus}
                onChange={setBonus}
              />
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="new-item" className="inline-flex items-center gap-1.5">
                  New company item
                </Label>
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
                      {formatItem(o.itemCode)} ({formatGold(o.profitPerPp, 3)} G/PP)
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <MetaChip
                icon={
                  steelPrice != null && newItemCode ? (
                    <ItemIcon itemCode="steel" className="size-3.5" />
                  ) : (
                    <Coins className="size-3.5" aria-hidden />
                  )
                }
                label={`Steel ${steelPrice != null ? `${formatGold(steelPrice, 2)} G` : "—"}`}
              />
              <MetaChip
                icon={<ItemIcon itemCode="concrete" className="size-3.5" />}
                label={`Concrete ${concretePrice != null ? `${formatGold(concretePrice, 2)} G` : "—"}`}
              />
              <MetaChip
                icon={
                  newItemCode ? (
                    <ItemIcon itemCode={newItemCode} className="size-3.5" />
                  ) : (
                    <Factory className="size-3.5" aria-hidden />
                  )
                }
                label={
                  newFactoryDaily != null
                    ? `New factory ${formatGold(newFactoryDaily, 2)} G/AE/day`
                    : "New factory —"
                }
              />
            </div>
            <details className="group mt-4 rounded-lg border border-border/80 bg-secondary/30 px-3 py-2">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
                <Settings2 className="size-3.5" aria-hidden />
                Advanced
                <span className="ml-auto text-xs font-normal opacity-70 group-open:hidden">
                  max steps {maxIterations.toLocaleString()}
                </span>
              </summary>
              <div className="mt-3 grid max-w-sm grid-cols-1 gap-3">
                <Field
                  id="max-iterations"
                  label="Max plan steps"
                  icon={<Gauge className="size-3.5" aria-hidden />}
                  type="number"
                  min={100}
                  step={500}
                  value={maxIterations}
                  onChange={(v) =>
                    setMaxIterations(
                      Math.max(100, Math.min(50_000, Math.round(v) || DEFAULT_MAX_ITERATIONS)),
                    )
                  }
                />
                <p className="m-0 text-xs text-muted-foreground">
                  Safety cap on greedy steps. Raise if a path shows <em>incomplete</em>. Default{" "}
                  {DEFAULT_MAX_ITERATIONS.toLocaleString()}.
                </p>
              </div>
            </details>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
              <h2 className="m-0 text-base font-semibold">Production curve</h2>
              <span className="text-xs text-muted-foreground">G/day over days</span>
            </div>
            <GrowthPathChart plans={plans} />
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <GrowthFactoryList
              factories={factories}
              onAeLevelChange={updateFactoryLevel}
              onRemove={removeFactory}
            />
            <GrowthStepLog path={focusedPath} result={focusedPlan} factories={factories} />
          </div>
        </>
      ) : null}
    </div>
  );
}

function PathCard({
  path,
  icon,
  result,
  active,
  onSelect,
}: {
  path: FocusedPath;
  icon: ReactNode;
  result: GrowthPlanResult | null;
  active: boolean;
  onSelect: () => void;
}) {
  const theme = PATH_THEME[path];
  const status = result ? formatPlanStatus(result) : { label: "—", tone: "muted" as const };

  return (
    <button type="button" onClick={onSelect} className="group text-left">
      <div
        className={cn(
          "rounded-xl border px-4 py-3.5 transition-[box-shadow,transform] duration-200",
          active ? `ring-2 ${theme.ring}` : "hover:-translate-y-0.5",
        )}
        style={{
          borderColor: theme.border,
          background: `linear-gradient(145deg, ${theme.soft}, transparent 70%), var(--card)`,
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className={cn("flex items-center gap-2 font-semibold", theme.text)}>
            {icon}
            <span>{theme.label}</span>
          </div>
          <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", theme.chip)}>
            {theme.short}
          </span>
        </div>
        <p
          className={cn(
            "mt-2 mb-0 text-3xl font-semibold tracking-tight tabular-nums",
            status.tone === "ok" && theme.text,
            status.tone === "bad" && "text-red-400",
            status.tone === "warn" && "text-amber-200",
            status.tone === "muted" && "text-muted-foreground",
          )}
        >
          {status.label}
        </p>
        <p className="mt-1 mb-0 text-sm text-muted-foreground">{theme.description}</p>
        {result ? (
          <p className="mt-2 mb-0 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{result.steps.length} steps</span>
            {result.complete ? <span className={theme.text}>reaches goal</span> : null}
            {result.stuck ? <span className="text-red-400">no affordable moves</span> : null}
            {result.hitIterLimit && !result.complete ? (
              <span className="text-amber-200">step limit</span>
            ) : null}
          </p>
        ) : null}
      </div>
    </button>
  );
}

function MetaChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2.5 py-1 font-mono text-muted-foreground">
      {icon}
      {label}
    </span>
  );
}

function Field({
  id,
  label,
  icon,
  type,
  value,
  onChange,
  min,
  max,
  step,
}: {
  id: string;
  label: string;
  icon?: ReactNode;
  type: "number";
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number | "any";
}) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="inline-flex items-center gap-1.5">
        {icon}
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        min={min}
        max={max}
        step={step}
        value={safeValue}
        onChange={(e) => onChange(parseNumberInput(e.target.value, 0))}
      />
    </div>
  );
}
