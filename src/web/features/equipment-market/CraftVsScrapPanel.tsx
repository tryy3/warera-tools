import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { GearTierId } from "@/calculator";
import {
  EQUIPMENT_TIER_DISPLAY_ORDER,
  equipmentTierShortLabel,
  formatEquipmentItem,
} from "@/equipment/catalog";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { moneyToNumber } from "@/money/decimal";
import { api } from "../../api";
import { GoldIcon } from "../../components/GoldIcon";
import type { CraftCompareResponse, CraftStatBlock } from "./types";

function GoldValue({ value }: { value: string | number | null | undefined }) {
  const n = moneyToNumber(value);
  if (n == null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 font-mono">
      <GoldIcon />
      {formatDisplayNumber(n)}
    </span>
  );
}

function DeltaValue({ value }: { value: string | number | null | undefined }) {
  const n = moneyToNumber(value);
  if (n == null) {
    return <span className="font-mono text-muted-foreground">—</span>;
  }
  const tone = n > 0 ? "text-success" : n < 0 ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 font-mono ${tone}`}>
      <GoldIcon />
      {n > 0 ? "+" : ""}
      {formatDisplayNumber(n)}
    </span>
  );
}

function ComparisonCells({ stats }: { stats: CraftStatBlock }) {
  return (
    <>
      <td className="px-3 py-2 text-right">
        <DeltaValue value={stats.minAdvantage} />
      </td>
      <td className="px-3 py-2 text-right">
        <DeltaValue value={stats.medianAdvantage} />
      </td>
      <td className="px-3 py-2 text-right">
        <DeltaValue value={stats.maxAdvantage} />
      </td>
      <td className="px-3 py-2 text-right font-mono">{formatDisplayNumber(stats.trades, 0)}</td>
    </>
  );
}

export function CraftVsScrapPanel({
  countryId,
  disabled = false,
}: {
  countryId: string;
  disabled?: boolean;
}) {
  const [tier, setTier] = useState<GearTierId>("red");
  const [fetched, setFetched] = useState<CraftCompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enabled = Boolean(countryId) && !disabled;
  const requestKey = enabled ? `${countryId}:${tier}` : null;
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const loading = requestKey != null && readyKey !== requestKey;
  const data = enabled && !loading ? fetched : null;

  useEffect(() => {
    if (!requestKey) return;

    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      try {
        const result = await api<CraftCompareResponse>(
          `/api/equipment/craft-compare?tier=${tier}&countryId=${encodeURIComponent(countryId)}`,
          { signal: controller.signal },
        );
        if (cancelled) return;
        setFetched(result);
        setError(null);
        setReadyKey(requestKey);
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
        setFetched(null);
        setReadyKey(requestKey);
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [countryId, requestKey, tier]);

  return (
    <section className="mt-4 mb-2 rounded-md border border-border bg-secondary/35 p-3.5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-[1.05rem] font-semibold">Craft vs scrap</h2>
          <p className="mt-0.5 mb-0 text-sm text-muted-foreground">
            Sell scraps vs craft (steel bought)
          </p>
        </div>
        <label className="text-sm">
          <span className="mb-1 block text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Tier
          </span>
          <select
            value={tier}
            onChange={(event) => setTier(event.target.value as GearTierId)}
            disabled={disabled}
            className="min-w-36 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
          >
            {EQUIPMENT_TIER_DISPLAY_ORDER.map((option) => (
              <option key={option} value={option}>
                {equipmentTierShortLabel(option)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!countryId ? (
        <p className="my-2 text-sm text-amber-200/80">
          Select a country above to compare crafting.
        </p>
      ) : null}
      {!loading && error ? <p className="my-2 text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <p className="my-2 text-sm text-muted-foreground">Loading craft comparison…</p>
      ) : null}

      {data ? (
        <>
          <dl className="mb-3 grid grid-cols-1 gap-2 rounded-md border border-border bg-card/60 px-3 py-2 sm:grid-cols-3">
            <div>
              <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                Sell scrap
              </dt>
              <dd className="mt-0.5 mb-0 font-semibold">
                <GoldValue value={data.scrapValue} />
              </dd>
            </div>
            <div>
              <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                Unit steel
              </dt>
              <dd className="mt-0.5 mb-0">
                <GoldValue value={data.steelPrice} />
              </dd>
            </div>
            <div>
              <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                Craft steel
              </dt>
              <dd className="mt-0.5 mb-0 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <span className="inline-flex items-center gap-1">
                  <span className="text-muted-foreground">Random</span>
                  <GoldValue value={data.steelCostRandom} />
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="text-muted-foreground">Specific</span>
                  <GoldValue value={data.steelCostSpecific} />
                </span>
              </dd>
            </div>
          </dl>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead className="bg-card/80 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Path</th>
                  <th className="px-3 py-2 text-right font-medium">Min Δ</th>
                  <th className="px-3 py-2 text-right font-medium">Med Δ</th>
                  <th className="px-3 py-2 text-right font-medium">Max Δ</th>
                  <th className="px-3 py-2 text-right font-medium">Trades</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Sell scrap</th>
                  <td className="px-3 py-2 text-right">
                    <DeltaValue value={0} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <DeltaValue value={0} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <DeltaValue value={0} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted-foreground">—</td>
                </tr>
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Random</th>
                  <ComparisonCells stats={data.random} />
                </tr>
                {data.specific.map((row) => (
                  <tr key={row.itemCode}>
                    <th className="px-3 py-2 text-left font-medium">
                      <Link
                        to="/equipment/$itemCode"
                        params={{ itemCode: row.itemCode }}
                        className="text-inherit underline decoration-border underline-offset-2 hover:text-primary"
                      >
                        {formatEquipmentItem(row.itemCode)}
                      </Link>
                    </th>
                    <ComparisonCells stats={row} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.pricedItemCount === 0 ? (
            <p className="mt-2 mb-0 text-sm text-muted-foreground">
              No sales in window for this tier.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
