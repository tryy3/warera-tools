import { getRouteApi, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import {
  MEMBER_HISTORY_METRICS,
  MU_HISTORY_METRICS,
  type MemberHistoryMetric,
  type MuHistoryMetric,
} from "../../../mu/metrics";
import { MU_HISTORY_RANGES, type MuHistoryRange } from "../../../mu/ranges";
import { ApiError, api } from "../../api";
import { formatMuMetricLabel, muRangeLabel } from "./formatMu";
import { MuHistoryChart } from "./MuHistoryChart";
import { MuMemberHistoryChart } from "./MuMemberHistoryChart";
import { MuRosterTable } from "./MuRosterTable";
import type {
  MuDetailResponse,
  MuHistoryResponse,
  MuLatestStats,
  MuMemberHistoryResponse,
} from "./types";

const muDetailRoute = getRouteApi("/mu_/$muId");

const selectClassName =
  "h-8 min-w-[12rem] rounded-lg border border-input bg-secondary px-2.5 text-sm text-foreground scheme-dark outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function formatNum(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatDisplayNumber(value, digits);
}

function rankSuffix(rank: number | null | undefined, tier: string | null | undefined): string {
  if (rank != null && Number.isFinite(rank)) {
    return tier
      ? ` (#${formatDisplayNumber(rank, 0)} · ${tier})`
      : ` (#${formatDisplayNumber(rank, 0)})`;
  }
  return "";
}

async function fetchMuDetail(muId: string): Promise<MuDetailResponse> {
  return api<MuDetailResponse>(`/api/mu/${encodeURIComponent(muId)}`);
}

async function fetchMuHistory(
  muId: string,
  range: MuHistoryRange,
  metric: MuHistoryMetric,
): Promise<MuHistoryResponse> {
  const params = new URLSearchParams({
    scope: "mu",
    range,
    metric,
  });
  return api<MuHistoryResponse>(`/api/mu/${encodeURIComponent(muId)}/history?${params.toString()}`);
}

async function fetchMemberHistory(
  muId: string,
  range: MuHistoryRange,
  metric: MemberHistoryMetric,
): Promise<MuMemberHistoryResponse> {
  const params = new URLSearchParams({
    scope: "members",
    range,
    metric,
  });
  return api<MuMemberHistoryResponse>(
    `/api/mu/${encodeURIComponent(muId)}/history?${params.toString()}`,
  );
}

function RangeChips({
  value,
  onChange,
  ariaLabel,
}: {
  value: MuHistoryRange;
  onChange: (range: MuHistoryRange) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={ariaLabel}>
      {MU_HISTORY_RANGES.map((option) => (
        <Button
          key={option}
          type="button"
          size="sm"
          variant={option === value ? "default" : "outline"}
          aria-pressed={option === value}
          onClick={() => onChange(option)}
        >
          {muRangeLabel(option)}
        </Button>
      ))}
    </div>
  );
}

function CurrentStrip({
  stats,
  level,
  mercenaryReputation,
}: {
  stats: MuLatestStats | null;
  level: number | null;
  mercenaryReputation: number | null;
}) {
  if (stats) {
    return (
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Weekly damages
          </dt>
          <dd className="mt-1 mb-0 font-mono">
            {formatNum(stats.weeklyDamages)}
            <span className="text-xs text-muted-foreground">
              {rankSuffix(stats.weeklyDamagesRank, stats.weeklyDamagesTier)}
            </span>
          </dd>
        </div>
        <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Bounty
          </dt>
          <dd className="mt-1 mb-0 font-mono">
            {formatNum(stats.bounty)}
            <span className="text-xs text-muted-foreground">
              {rankSuffix(stats.bountyRank, stats.bountyTier)}
            </span>
          </dd>
        </div>
        <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Reputation
          </dt>
          <dd className="mt-1 mb-0 font-mono">
            {formatNum(stats.reputation)}
            <span className="text-xs text-muted-foreground">
              {rankSuffix(stats.reputationRank, stats.reputationTier)}
            </span>
          </dd>
        </div>
        <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Wealth
          </dt>
          <dd className="mt-1 mb-0 font-mono">
            {formatNum(stats.wealth)}
            <span className="text-xs text-muted-foreground">
              {rankSuffix(stats.wealthRank, stats.wealthTier)}
            </span>
          </dd>
        </div>
      </dl>
    );
  }

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
        <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">Level</dt>
        <dd className="mt-1 mb-0 font-mono">{formatNum(level, 0)}</dd>
      </div>
      <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
        <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
          Mercenary reputation
        </dt>
        <dd className="mt-1 mb-0 font-mono">{formatNum(mercenaryReputation, 2)}</dd>
      </div>
    </dl>
  );
}

export function MuDetailPage() {
  const { muId } = muDetailRoute.useParams();
  const { range, memberRange, muMetric, memberMetric } = muDetailRoute.useSearch();
  const navigate = muDetailRoute.useNavigate();

  const [detail, setDetail] = useState<MuDetailResponse | null>(null);
  const [muHistory, setMuHistory] = useState<MuHistoryResponse | null>(null);
  const [memberHistory, setMemberHistory] = useState<MuMemberHistoryResponse | null>(null);

  const [detailLoading, setDetailLoading] = useState(true);
  const [muHistoryLoading, setMuHistoryLoading] = useState(true);
  const [memberHistoryLoading, setMemberHistoryLoading] = useState(true);

  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setDetailLoading(true);
    setError(null);
    setNotFound(false);

    void fetchMuDetail(muId)
      .then((result) => {
        if (cancelled) return;
        setDetail(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.code === "not_found")) {
          setNotFound(true);
          setDetail(null);
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
        setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [muId, reloadToken]);

  useEffect(() => {
    if (notFound || detailLoading) return;

    let cancelled = false;
    setMuHistoryLoading(true);

    void fetchMuHistory(muId, range, muMetric)
      .then((result) => {
        if (cancelled) return;
        setMuHistory(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setMuHistory(null);
      })
      .finally(() => {
        if (!cancelled) setMuHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [muId, range, muMetric, notFound, detailLoading, reloadToken]);

  useEffect(() => {
    if (notFound || detailLoading) return;

    let cancelled = false;
    setMemberHistoryLoading(true);

    void fetchMemberHistory(muId, memberRange, memberMetric)
      .then((result) => {
        if (cancelled) return;
        setMemberHistory(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setMemberHistory(null);
      })
      .finally(() => {
        if (!cancelled) setMemberHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [muId, memberRange, memberMetric, notFound, detailLoading, reloadToken]);

  const muMetricLabel = formatMuMetricLabel(muMetric);
  const memberMetricLabel = formatMuMetricLabel(memberMetric);
  const historyAvailable = detail?.meta.historyAvailable ?? false;

  return (
    <div className="mx-auto max-w-[1200px] rounded-md border border-border bg-card p-4 pb-6">
      <div className="mb-3">
        <Link to="/mu" className="text-sm text-muted-foreground no-underline hover:text-foreground">
          ← Back to MU search
        </Link>
      </div>

      {detailLoading ? <p className="text-muted-foreground">Loading military unit…</p> : null}

      {notFound ? <p className="text-muted-foreground">Military unit not found.</p> : null}

      {error ? (
        <div className="my-2 flex flex-wrap items-center gap-3">
          <p className="m-0 text-destructive">{error}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setReloadToken((token) => token + 1)}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {!detailLoading && !notFound && detail ? (
        <>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              {detail.mu.avatarUrl ? (
                <img
                  src={detail.mu.avatarUrl}
                  alt=""
                  className="size-12 rounded-md border border-border object-cover"
                />
              ) : (
                <div className="flex size-12 items-center justify-center rounded-md border border-border bg-background/40 text-sm text-muted-foreground">
                  MU
                </div>
              )}
              <div className="min-w-0">
                <h1 className="mb-0.5 truncate text-[1.35rem] font-semibold tracking-tight">
                  {detail.mu.name ?? detail.mu.id}
                </h1>
                <p className="m-0 text-sm text-muted-foreground">
                  {detail.mu.id}
                  {detail.mu.level != null
                    ? ` · Level ${formatDisplayNumber(detail.mu.level, 0)}`
                    : ""}
                  {detail.members.length > 0
                    ? ` · ${formatDisplayNumber(detail.members.length, 0)} members`
                    : ""}
                  {detail.meta.watched ? " · watched" : ""}
                  {detail.meta.liveFilled ? " · live-fetched" : ""}
                  {detail.mu.fetchedAt
                    ? ` · fetched ${new Date(detail.mu.fetchedAt).toLocaleString()}`
                    : ""}
                </p>
              </div>
            </div>
          </div>

          <section className="mb-5">
            <h2 className="mt-0 mb-2 text-[1.05rem] font-semibold">Current</h2>
            <CurrentStrip
              stats={detail.latestMuStats}
              level={detail.mu.level}
              mercenaryReputation={detail.mu.mercenaryReputation}
            />
          </section>

          {!historyAvailable ? (
            <p className="mb-5 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-sm text-muted-foreground">
              History appears after the next MU stats poll. Current identity and roster are shown
              below.
            </p>
          ) : null}

          <section className="mb-5">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
              <h2 className="m-0 text-[1.05rem] font-semibold">MU history</h2>
              <select
                className={selectClassName}
                value={muMetric}
                aria-label="MU metric"
                onChange={(e) => {
                  const next = e.target.value as MuHistoryMetric;
                  void navigate({ search: (prev) => ({ ...prev, muMetric: next }), replace: true });
                }}
              >
                {MU_HISTORY_METRICS.map((metric) => (
                  <option key={metric} value={metric}>
                    {formatMuMetricLabel(metric)}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-3">
              <RangeChips
                value={range}
                ariaLabel="MU history range"
                onChange={(next) => {
                  void navigate({ search: (prev) => ({ ...prev, range: next }), replace: true });
                }}
              />
            </div>
            {muHistoryLoading ? (
              <p className="text-sm text-muted-foreground">Loading MU history…</p>
            ) : (
              <MuHistoryChart points={muHistory?.points ?? []} metricLabel={muMetricLabel} />
            )}
          </section>

          <section className="mb-5">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
              <h2 className="m-0 text-[1.05rem] font-semibold">Member history</h2>
              <select
                className={selectClassName}
                value={memberMetric}
                aria-label="Member metric"
                onChange={(e) => {
                  const next = e.target.value as MemberHistoryMetric;
                  void navigate({
                    search: (prev) => ({ ...prev, memberMetric: next }),
                    replace: true,
                  });
                }}
              >
                {MEMBER_HISTORY_METRICS.map((metric) => (
                  <option key={metric} value={metric}>
                    {formatMuMetricLabel(metric)}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-3">
              <RangeChips
                value={memberRange}
                ariaLabel="Member history range"
                onChange={(next) => {
                  void navigate({
                    search: (prev) => ({ ...prev, memberRange: next }),
                    replace: true,
                  });
                }}
              />
            </div>
            {memberHistoryLoading ? (
              <p className="text-sm text-muted-foreground">Loading member history…</p>
            ) : (
              <MuMemberHistoryChart
                series={memberHistory?.series ?? []}
                metricLabel={memberMetricLabel}
              />
            )}
          </section>

          <section>
            <h2 className="mt-0 mb-2 text-[1.05rem] font-semibold">Roster</h2>
            <MuRosterTable members={detail.members} memberMetric={memberMetric} />
          </section>
        </>
      ) : null}
    </div>
  );
}
