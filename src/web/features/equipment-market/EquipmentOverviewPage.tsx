import { useEffect, useState } from "react";
import { scrapAmountForTier, type GearTierId } from "@/calculator";
import {
  compareEquipmentItems,
  EQUIPMENT_TIER_DISPLAY_ORDER,
  equipmentTierShortLabel,
} from "@/equipment/catalog";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { api } from "../../api";
import { GoldIcon } from "../../components/GoldIcon";
import { loadEquipmentCountryId, saveEquipmentCountryId } from "../../lib/equipmentPrefs";
import { CountrySelect } from "../calculator/CountrySelect";
import { EquipmentItemCard } from "./EquipmentItemCard";
import type { CountriesResponse, Country, OverviewItem, OverviewResponse } from "./types";

const TIER_ORDER: Array<GearTierId | null> = [...EQUIPMENT_TIER_DISPLAY_ORDER, null];

function pickDefaultCountryId(countries: Country[]): string {
  return countries.find((c) => c.isoCode === "SE")?.id ?? countries[0]?.id ?? "";
}

function formatWindow(windowMs: number): string {
  const dayMs = 24 * 60 * 60 * 1000;
  if (windowMs === dayMs) return "24h";
  if (windowMs % dayMs === 0) return `${windowMs / dayMs}d`;
  const hours = windowMs / (60 * 60 * 1000);
  if (Number.isInteger(hours)) return `${hours}h`;
  return `${formatDisplayNumber(hours, 1)}h`;
}

function tradesLabelForWindow(windowMs: number | null): string {
  if (windowMs == null) return "Trades";
  return `Trades (${formatWindow(windowMs)})`;
}

function formatNum(value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatDisplayNumber(value, digits);
}

function sellerNetFromMarket(marketMedian: number | null, taxRate: number | null): number | null {
  if (marketMedian == null || !Number.isFinite(marketMedian)) return null;
  if (taxRate == null || !Number.isFinite(taxRate)) return null;
  return marketMedian / (1 + taxRate);
}

function groupByTier(items: OverviewItem[]): Array<{
  tier: GearTierId | null;
  items: OverviewItem[];
}> {
  const buckets = new Map<GearTierId | null, OverviewItem[]>();
  for (const tier of TIER_ORDER) buckets.set(tier, []);
  for (const item of items) {
    const list = buckets.get(item.tier) ?? buckets.get(null)!;
    list.push(item);
  }
  return TIER_ORDER.flatMap((tier) => {
    const group = buckets.get(tier) ?? [];
    if (group.length === 0) return [];
    return [
      {
        tier,
        items: [...group].sort((a, b) => compareEquipmentItems(a.itemCode, b.itemCode)),
      },
    ];
  });
}

function tierStripStats(
  tier: GearTierId | null,
  tierItems: OverviewItem[],
  scrapPrice: number | null,
): {
  scrapQty: number | null;
  scrapFloor: number | null;
  trades: number;
} {
  const scrapQty = tier != null ? scrapAmountForTier(tier) : null;
  const fromItems = tierItems.find((i) => i.scrapFloor != null)?.scrapFloor ?? null;
  const scrapFloor =
    fromItems ?? (scrapQty != null && scrapPrice != null ? scrapQty * scrapPrice : null);
  const trades = tierItems.reduce((sum, i) => sum + i.trades, 0);
  return { scrapQty, scrapFloor, trades };
}

function TierStatsStrip({
  tier,
  scrapFloor,
  scrapQty,
  scrapPrice,
  trades,
  tradesLabel,
}: {
  tier: GearTierId | null;
  scrapFloor: number | null;
  scrapQty: number | null;
  scrapPrice: number | null;
  trades: number;
  tradesLabel: string;
}) {
  const tierClass = tier != null ? `tier-stats-strip--${tier}` : "";
  return (
    <div className={`tier-stats-strip mb-2.5 px-3 py-2 ${tierClass}`}>
      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Scrap price
          </dt>
          <dd className="mt-0.5 mb-0 inline-flex items-center gap-1 font-mono font-semibold">
            {scrapFloor != null ? (
              <>
                <GoldIcon />
                {formatDisplayNumber(scrapFloor)}
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Scraps
          </dt>
          <dd className="mt-0.5 mb-0 font-mono font-semibold">
            {scrapQty != null ? formatDisplayNumber(scrapQty, 0) : "—"}
          </dd>
        </div>
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Unit scrap
          </dt>
          <dd className="mt-0.5 mb-0 inline-flex items-center gap-1 font-mono">
            {scrapPrice != null ? (
              <>
                <GoldIcon />
                {formatDisplayNumber(scrapPrice)}
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            {tradesLabel}
          </dt>
          <dd className="mt-0.5 mb-0 font-mono">{formatNum(trades, 0)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function EquipmentOverviewPage() {
  const [items, setItems] = useState<OverviewItem[]>([]);
  const [scrapPrice, setScrapPrice] = useState<number | null>(null);
  const [scrapedAt, setScrapedAt] = useState<string | null>(null);
  const [windowMs, setWindowMs] = useState<number | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryId, setCountryId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [overview, countriesData] = await Promise.all([
          api<OverviewResponse>("/api/equipment/overview"),
          api<CountriesResponse>("/api/countries"),
        ]);
        if (cancelled) return;

        setItems(overview.items);
        setScrapPrice(overview.scrapPrice);
        setScrapedAt(overview.scrapedAt);
        setWindowMs(overview.windowMs);
        setCountries(countriesData.countries);

        const saved = loadEquipmentCountryId();
        const next =
          saved && countriesData.countries.some((c) => c.id === saved)
            ? saved
            : pickDefaultCountryId(countriesData.countries);
        setCountryId(next);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setItems([]);
        setScrapPrice(null);
        setScrapedAt(null);
        setWindowMs(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function onCountryChange(next: string) {
    setCountryId(next);
    saveEquipmentCountryId(next);
  }

  const selectedCountry = countries.find((c) => c.id === countryId) ?? null;
  const taxRate = selectedCountry?.taxRate ?? null;
  const grouped = groupByTier(items);
  const hasItems = items.length > 0;
  const taxPct = taxRate != null ? formatDisplayNumber(taxRate * 100, 2) : null;
  const tradesLabel = tradesLabelForWindow(windowMs);

  return (
    <div className="mx-auto max-w-[1200px] rounded-md border border-border bg-card p-4 pb-6">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-0.5 text-[1.35rem] font-semibold tracking-tight">Equipment</h1>
          <p className="m-0 text-muted-foreground">
            Market median vs scrap price by item.
            {windowMs != null ? ` · last ${formatWindow(windowMs)}` : null}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="text-sm">
            <div className="text-[0.75em] tracking-wide text-muted-foreground uppercase">Scrap</div>
            <div className="mt-0.5 inline-flex items-center gap-1 font-mono">
              {scrapPrice != null ? (
                <>
                  <GoldIcon />
                  {formatDisplayNumber(scrapPrice)}
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
            {scrapedAt ? (
              <div className="mt-0.5 text-xs text-muted-foreground">
                as of {new Date(scrapedAt).toLocaleString()}
              </div>
            ) : null}
          </div>
          <div className="min-w-44">
            <div className="mb-1 text-[0.75em] tracking-wide text-muted-foreground uppercase">
              Country (tax)
            </div>
            <CountrySelect
              countries={countries}
              value={countryId}
              onChange={onCountryChange}
              disabled={loading || countries.length === 0}
            />
            {taxPct != null ? (
              <div className="mt-0.5 text-xs text-muted-foreground">{taxPct}% tax</div>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <p className="my-2 text-destructive">{error}</p> : null}
      {loading ? <p className="text-muted-foreground">Loading equipment market…</p> : null}

      {!loading && !hasItems && !error ? (
        <p className="text-muted-foreground">No equipment trades in the current window.</p>
      ) : null}

      {!loading && hasItems
        ? grouped.map(({ tier, items: tierItems }) => {
            const strip = tierStripStats(tier, tierItems, scrapPrice);
            return (
              <section key={tier ?? "unknown"} className="mt-5">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="m-0 text-[1.05rem] font-semibold">
                    {equipmentTierShortLabel(tier)}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {tierItems.length} slot{tierItems.length === 1 ? "" : "s"}
                  </span>
                </div>
                <TierStatsStrip
                  tier={tier}
                  scrapFloor={strip.scrapFloor}
                  scrapQty={strip.scrapQty}
                  scrapPrice={scrapPrice}
                  trades={strip.trades}
                  tradesLabel={tradesLabel}
                />
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3">
                  {tierItems.map((item) => (
                    <EquipmentItemCard
                      key={item.itemCode}
                      itemCode={item.itemCode}
                      tier={item.tier}
                      marketMedian={item.marketMedian}
                      sellerNet={sellerNetFromMarket(item.marketMedian, taxRate)}
                      spread={item.spread}
                      trades={item.trades}
                      tradesLabel={tradesLabel}
                    />
                  ))}
                </div>
              </section>
            );
          })
        : null}
    </div>
  );
}
