import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GEAR_TIERS, type GearTierId } from "@/calculator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatEquipmentItem } from "@/equipment/catalog";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { api } from "../../api";
import { GoldIcon } from "../../components/GoldIcon";
import { ItemIcon } from "../../components/ItemIcon";
import { loadEquipmentCountryId, saveEquipmentCountryId } from "../../lib/equipmentPrefs";
import { CountrySelect } from "../calculator/CountrySelect";
import type { CountriesResponse, Country, OverviewItem, OverviewResponse } from "./types";

const TIER_ORDER: Array<GearTierId | null> = [...GEAR_TIERS.map((t) => t.id), null];

function pickDefaultCountryId(countries: Country[]): string {
  return countries.find((c) => c.isoCode === "SE")?.id ?? countries[0]?.id ?? "";
}

function formatNum(value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatDisplayNumber(value, digits);
}

function formatWindow(windowMs: number): string {
  const hours = windowMs / (60 * 60 * 1000);
  if (Number.isInteger(hours)) return `${hours}h`;
  return `${formatDisplayNumber(hours, 1)}h`;
}

function tierLabel(tier: GearTierId | null): string {
  if (tier == null) return "Unknown";
  return GEAR_TIERS.find((t) => t.id === tier)?.label ?? tier;
}

function spreadClass(spread: number | null): string {
  if (spread == null || !Number.isFinite(spread)) return "text-muted-foreground";
  if (spread >= 10) return "font-mono text-success";
  if (spread < 3) return "font-mono text-destructive";
  return "font-mono";
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
    return [{ tier, items: group }];
  });
}

export function EquipmentOverviewPage() {
  const navigate = useNavigate();
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
  const grouped = groupByTier(items);
  const hasItems = items.length > 0;
  const taxPct =
    selectedCountry != null ? formatDisplayNumber(selectedCountry.taxRate * 100, 2) : null;

  return (
    <div className="mx-auto max-w-[1200px] rounded-md border border-border bg-card p-4 pb-6">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-0.5 text-[1.35rem] font-semibold tracking-tight">Equipment</h1>
          <p className="m-0 text-muted-foreground">
            Market median vs scrap floor by item.
            {windowMs != null ? ` · window ${formatWindow(windowMs)}` : null}
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
        ? grouped.map(({ tier, items: tierItems }) => (
            <section key={tier ?? "unknown"} className="mt-5">
              <h2 className="mt-0 mb-2 text-[1.05rem] font-semibold">{tierLabel(tier)}</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Market</TableHead>
                    <TableHead className="text-right">Scrap floor</TableHead>
                    <TableHead className="text-right">Spread</TableHead>
                    <TableHead className="text-right">Trades</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tierItems.map((item) => (
                    <TableRow
                      key={item.itemCode}
                      className="cursor-pointer hover:bg-secondary/50"
                      onClick={() => {
                        void navigate({
                          to: "/equipment/$itemCode",
                          params: { itemCode: item.itemCode },
                        });
                      }}
                    >
                      <TableCell>
                        <Link
                          to="/equipment/$itemCode"
                          params={{ itemCode: item.itemCode }}
                          className="inline-flex items-center gap-2 text-inherit no-underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-background/60">
                            <ItemIcon itemCode={item.itemCode} className="size-6 object-contain" />
                          </span>
                          <span className="font-medium">{formatEquipmentItem(item.itemCode)}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatNum(item.marketMedian)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatNum(item.scrapFloor)}
                      </TableCell>
                      <TableCell className={`text-right ${spreadClass(item.spread)}`}>
                        {formatNum(item.spread)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{item.trades}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          ))
        : null}
    </div>
  );
}
