import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { api } from "../../api";
import { FlagIcon } from "../../components/FlagIcon";
import { GoldIcon } from "../../components/GoldIcon";
import { ItemIcon } from "../../components/ItemIcon";
import { buildEconomySearch } from "../../lib/economySearch";
import {
  loadRecentEconomyPlayers,
  rememberEconomyPlayer,
  type RecentEconomyPlayer,
} from "../../lib/recentEconomyPlayers";
import type { AdvisorResponse, CompanyAdvisorRow, SearchUsersResponse } from "./types";

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

  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<SearchUsersResponse["users"]>([]);
  const [advisor, setAdvisor] = useState<AdvisorResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingAdvisor, setLoadingAdvisor] = useState(false);
  const [polling, setPolling] = useState(false);
  const [refreshingCompanies, setRefreshingCompanies] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentPlayers, setRecentPlayers] = useState<RecentEconomyPlayer[]>(() =>
    loadRecentEconomyPlayers(),
  );

  const displayName = selectedUsername ?? selectedUserId;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setUsers([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        setError(null);
        try {
          const data = await api<SearchUsersResponse>(
            `/api/economy/search?q=${encodeURIComponent(q)}`,
          );
          setUsers(data.users);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setSearching(false);
        }
      })();
    }, 300);
    return () => window.clearTimeout(handle);
  }, [query]);

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
    setRecentPlayers(rememberEconomyPlayer({ userId, username }));
  }

  return (
    <div className="page economy-page">
      <div className="page-header">
        <div>
          <h1>Economy</h1>
          <p className="muted">
            AE daily value = AE level × (1 + production bonus) × 24h × Profit/PP. Formulas shown per
            company.
          </p>
        </div>
        <button
          type="button"
          className="btn"
          disabled={polling}
          onClick={() => void refreshPrices()}
        >
          {polling ? "Refreshing…" : "Refresh prices"}
        </button>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <section className="economy-search">
        <label htmlFor="user-search">Find player</label>
        <input
          id="user-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by username…"
          autoComplete="off"
        />
        {recentPlayers.length > 0 ? (
          <div className="economy-recent">
            <span className="muted small">Recent</span>
            <ul className="economy-recent-list">
              {recentPlayers.map((p) => (
                <li key={p.userId}>
                  <button
                    type="button"
                    className={
                      selectedUserId === p.userId
                        ? "economy-recent-btn active"
                        : "economy-recent-btn"
                    }
                    onClick={() => {
                      selectPlayer(p.userId, p.username);
                    }}
                  >
                    {p.username}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {searching ? <p className="muted">Searching…</p> : null}
        {users.length > 0 ? (
          <ul className="economy-user-list">
            {users.map((u) => (
              <li key={u.userId}>
                <button
                  type="button"
                  className={selectedUserId === u.userId ? "economy-user active" : "economy-user"}
                  onClick={() => {
                    selectPlayer(u.userId, u.username);
                  }}
                >
                  <span>{u.username}</span>
                  <span className="muted mono">{u.userId.slice(-6)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {displayName ? (
        <div className="economy-user-meta">
          <p className="muted">
            Showing companies for <strong>{displayName}</strong>
            {advisor?.recordedAt
              ? ` · prices as of ${new Date(advisor.recordedAt).toLocaleString()}`
              : null}
            {advisor?.companiesFetchedAt
              ? ` · companies as of ${new Date(advisor.companiesFetchedAt).toLocaleString()}`
              : null}
          </p>
          <button
            type="button"
            className="btn"
            disabled={!selectedUserId || refreshingCompanies || loadingAdvisor}
            onClick={() => void refreshCompanies()}
          >
            {refreshingCompanies ? "Refreshing…" : "Refresh companies"}
          </button>
        </div>
      ) : null}

      {loadingAdvisor ? <p className="muted">Loading advisor…</p> : null}

      <div className="economy-grid">
        <section className="economy-col">
          <h2>Companies</h2>
          {!advisor && !loadingAdvisor ? (
            <p className="muted">Search for a player to load companies.</p>
          ) : null}
          {advisor?.companies.length === 0 ? (
            <p className="muted">No companies found for this user.</p>
          ) : null}
          <div className="economy-company-list">
            {advisor?.companies.map((row) => (
              <CompanyCard key={row.company.id} row={row} />
            ))}
          </div>
        </section>

        <section className="economy-col">
          <h2>Market opportunities</h2>
          <p className="muted small">
            Ranked by Profit/PP = (market price − input cost) / consumed PP.
          </p>
          <table className="economy-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>G/PP</th>
                <th>Formula</th>
              </tr>
            </thead>
            <tbody>
              {(advisor?.opportunities ?? []).map((o) => (
                <tr key={o.itemCode}>
                  <td>
                    <span className="icon-label">
                      <ItemIcon itemCode={o.itemCode} />
                      {formatItem(o.itemCode)}
                    </span>
                  </td>
                  <td className="mono">
                    <GoldAmount value={o.profitPerPp} digits={4} />
                  </td>
                  <td className="mono small muted">{o.formula}</td>
                </tr>
              ))}
              {!advisor?.opportunities?.length ? (
                <tr>
                  <td colSpan={3} className="muted">
                    No price data yet — refresh prices.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
