import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
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
import { api } from "../../api";
import { FlagIcon } from "../../components/FlagIcon";
import { GoldIcon } from "../../components/GoldIcon";
import { ItemIcon } from "../../components/ItemIcon";
import { buildEconomySearch } from "../../lib/economySearch";
import { EconomyPlayerSearch } from "./EconomyPlayerSearch";
import type { AdvisorResponse, CompanyAdvisorRow } from "./types";

const economyRoute = getRouteApi("/economy");

function formatNum(value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatDisplayNumber(value, digits);
}

function formatItem(code: string): string {
  return code.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function FormulaBox({ label, children }: { label: string; children: string }) {
  return (
    <div className="formula-box">
      <div className="formula-label">{label}</div>
      <code className="formula-text">{children}</code>
    </div>
  );
}

function FormulaDetails({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="formula-details">
      <summary className="formula-details-summary">{label}</summary>
      <div className="formula-details-body">{children}</div>
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
    <span className="icon-label">
      <GoldIcon />
      {prefix}
      {formatDisplayNumber(value, digits)}
      {suffix}
    </span>
  );
}

function CompanyCard({ row }: { row: CompanyAdvisorRow }) {
  const bonusPct = row.company.productionBonus != null ? row.company.productionBonus * 100 : null;

  return (
    <article className="economy-card">
      <header>
        <h3>{row.company.name}</h3>
        <span className="pill positive-pill">
          {row.currentDailyValue != null ? (
            <GoldAmount value={row.currentDailyValue} digits={3} prefix="+" suffix="/day" />
          ) : (
            "—"
          )}
        </span>
      </header>

      <dl className="economy-stats">
        <div>
          <dt>Material</dt>
          <dd>
            {row.company.itemCode ? (
              <span className="icon-label">
                <ItemIcon itemCode={row.company.itemCode} />
                {formatItem(row.company.itemCode)}
              </span>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt>Region</dt>
          <dd>
            <span className="icon-label">
              <FlagIcon code={row.company.regionCountryCode} />
              {row.company.regionName ?? row.company.regionId ?? "—"}
            </span>
          </dd>
        </div>
        <div>
          <dt>AE level</dt>
          <dd>{row.company.aeLevel}</dd>
        </div>
        <div>
          <dt>Bonus</dt>
          <dd>{bonusPct != null ? `${formatNum(bonusPct, 1)}%` : "—"}</dd>
        </div>
        <div>
          <dt>Profit/PP</dt>
          <dd>
            <GoldAmount value={row.currentProfitPerPp} digits={4} />
          </dd>
        </div>
        <div>
          <dt>Daily PP</dt>
          <dd>{row.aeBreakdown ? formatNum(row.aeBreakdown.dailyPp, 1) : "—"}</dd>
        </div>
      </dl>

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
        <div className="economy-switch">
          <div className="economy-switch-title">Best switch (raw)</div>
          <div className="economy-switch-summary">
            <span className="economy-switch-arrow">→</span>
            <span className="icon-label">
              <ItemIcon itemCode={row.bestSwitch.itemCode} />
              <strong>{formatItem(row.bestSwitch.itemCode)}</strong>
            </span>
            {row.bestSwitch.bestRegionName || row.bestSwitch.bestRegionId ? (
              <>
                <span className="economy-switch-at">@</span>
                <span className="icon-label">
                  <FlagIcon code={row.bestSwitch.bestRegionCountryCode} />
                  {row.bestSwitch.bestRegionName ?? row.bestSwitch.bestRegionId}
                </span>
              </>
            ) : (
              <span>(same region)</span>
            )}
            <span className="economy-switch-bonus">
              (+{formatNum(row.bestSwitch.bestBonus * 100, 1)}% bonus)
            </span>
          </div>
          <dl className="economy-stats compact">
            <div>
              <dt>Δ / day</dt>
              <dd className="positive">+{formatNum(row.bestSwitch.dailyDelta, 2)} G</dd>
            </div>
            <div>
              <dt>Transfer</dt>
              <dd className="economy-transfer">
                <span>{row.bestSwitch.transferConcrete} Concrete</span>
                <span className="economy-transfer-gold">
                  ~ <GoldAmount value={row.bestSwitch.transferGold} digits={1} />
                </span>
              </dd>
            </div>
            <div>
              <dt>Payback</dt>
              <dd>
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
        <p className="muted small">No profitable switch found with current prices.</p>
      )}
    </article>
  );
}

export function EconomyPage() {
  const search = economyRoute.useSearch();
  const navigate = economyRoute.useNavigate();
  const selectedUserId = search.userId ?? null;
  const selectedUsername = search.username ?? null;

  const [advisor, setAdvisor] = useState<AdvisorResponse | null>(null);
  const [loadingAdvisor, setLoadingAdvisor] = useState(false);
  const [polling, setPolling] = useState(false);
  const [refreshingCompanies, setRefreshingCompanies] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = selectedUsername ?? selectedUserId;

  async function loadAdvisor(userId: string) {
    setLoadingAdvisor(true);
    setError(null);
    try {
      const data = await api<AdvisorResponse>(
        `/api/economy/advisor?userId=${encodeURIComponent(userId)}`,
      );
      setAdvisor(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAdvisor(null);
    } finally {
      setLoadingAdvisor(false);
    }
  }

  useEffect(() => {
    if (!selectedUserId) {
      setAdvisor(null);
      return;
    }
    void loadAdvisor(selectedUserId);
  }, [selectedUserId]);

  async function refreshPrices() {
    setPolling(true);
    setError(null);
    try {
      await api("/api/prices/poll", { method: "POST" });
      if (selectedUserId) {
        await loadAdvisor(selectedUserId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPolling(false);
    }
  }

  async function refreshCompanies() {
    if (!selectedUserId) return;
    setRefreshingCompanies(true);
    setError(null);
    try {
      const data = await api<AdvisorResponse>(
        `/api/economy/advisor?userId=${encodeURIComponent(selectedUserId)}&refresh=1`,
      );
      setAdvisor(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshingCompanies(false);
    }
  }

  function selectPlayer(userId: string, username: string) {
    void navigate({
      search: buildEconomySearch({ userId, username }),
      replace: true,
    });
  }

  return (
    <div className="mx-auto max-w-[1200px] rounded-md border border-border bg-card p-4 pb-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h1 className="mb-0.5 text-[1.35rem] font-semibold tracking-tight">Economy</h1>
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

      <section className="my-4 flex max-w-md flex-col gap-1.5">
        <label htmlFor="user-search" className="text-sm text-muted-foreground">
          Find player
        </label>
        <EconomyPlayerSearch selectedUserId={selectedUserId} onSelect={selectPlayer} />
      </section>

      {displayName ? (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-3">
          <p className="m-0 min-w-64 flex-1 text-muted-foreground">
            Showing companies for <strong className="text-foreground">{displayName}</strong>
            {advisor?.recordedAt
              ? ` · prices as of ${new Date(advisor.recordedAt).toLocaleString()}`
              : null}
            {advisor?.companiesFetchedAt
              ? ` · companies as of ${new Date(advisor.companiesFetchedAt).toLocaleString()}`
              : null}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!selectedUserId || refreshingCompanies || loadingAdvisor}
            onClick={() => void refreshCompanies()}
          >
            {refreshingCompanies ? "Refreshing…" : "Refresh companies"}
          </Button>
        </div>
      ) : null}

      {loadingAdvisor ? <p className="text-muted-foreground">Loading advisor…</p> : null}

      <div className="mt-3 grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section>
          <h2 className="mt-0 mb-2 text-[1.05rem] font-semibold">Companies</h2>
          {!advisor && !loadingAdvisor ? (
            <p className="text-muted-foreground">Search for a player to load companies.</p>
          ) : null}
          {advisor?.companies.length === 0 ? (
            <p className="text-muted-foreground">No companies found for this user.</p>
          ) : null}
          <div className="flex flex-col gap-3">
            {advisor?.companies.map((row) => (
              <CompanyCard key={row.company.id} row={row} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mt-0 mb-2 text-[1.05rem] font-semibold">Market opportunities</h2>
          <p className="mb-2 text-sm text-muted-foreground">
            Ranked by Profit/PP = (market price − input cost) / consumed PP.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>G/PP</TableHead>
                <TableHead>Formula</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(advisor?.opportunities ?? []).map((o) => (
                <TableRow key={o.itemCode}>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      <ItemIcon itemCode={o.itemCode} />
                      {formatItem(o.itemCode)}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono">
                    <GoldAmount value={o.profitPerPp} digits={4} />
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {o.formula}
                  </TableCell>
                </TableRow>
              ))}
              {!advisor?.opportunities?.length ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    No price data yet — refresh prices.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </section>
      </div>
    </div>
  );
}
