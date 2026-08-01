import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { calculateProfit, scrapAmountForTier } from "@/calculator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "../../api";
import { DEFAULT_CALC_TIER, buildCalculatorSearch } from "../../lib/calculatorSearch";
import { CountrySelect } from "./CountrySelect";
import { TierPicker } from "./TierPicker";
import type { CountriesResponse, Country, ScrapsResponse } from "./types";

const calculatorRoute = getRouteApi("/calculator");

function formatTs(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

function formatNum(value: number, digits = 4): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function pickDefaultCountryId(countries: Country[]): string {
  return countries.find((c) => c.isoCode === "SE")?.id ?? countries[0]?.id ?? "";
}

export function CalculatorPage() {
  const search = calculatorRoute.useSearch();
  const navigate = calculatorRoute.useNavigate();

  const tier = search.tier ?? DEFAULT_CALC_TIER;
  const inclPrice = search.price ?? "";

  const [countries, setCountries] = useState<Country[]>([]);
  const [scraps, setScraps] = useState<ScrapsResponse | null>(null);
  const [countryId, setCountryIdState] = useState(search.country ?? "");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function syncSearch(next: {
    tier: typeof tier;
    countryId: string;
    inclPrice: string;
    defaultCountryId: string;
  }) {
    void navigate({
      search: buildCalculatorSearch(next),
      replace: true,
    });
  }

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [scrapsData, countriesData] = await Promise.all([
        api<ScrapsResponse>("/api/scraps"),
        api<CountriesResponse>("/api/countries"),
      ]);
      setScraps(scrapsData);
      setCountries(countriesData.countries);
      setCountryIdState((prev) => {
        if (search.country && countriesData.countries.some((c) => c.id === search.country)) {
          return search.country;
        }
        if (prev && countriesData.countries.some((c) => c.id === prev)) return prev;
        return pickDefaultCountryId(countriesData.countries);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function refreshScrapPrice() {
    setRefreshing(true);
    setError(null);
    try {
      const data = await api<ScrapsResponse>("/api/scraps/refresh", { method: "POST" });
      setScraps(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  // Keep local country in sync with URL on Back/Forward without writing defaults into the URL.
  useEffect(() => {
    if (countries.length === 0) return;

    if (search.country && countries.some((c) => c.id === search.country)) {
      setCountryIdState(search.country);
      return;
    }
    setCountryIdState(pickDefaultCountryId(countries));
  }, [search.country, countries]);

  const selectedCountry = countries.find((c) => c.id === countryId) ?? null;
  const taxRate = selectedCountry?.taxRate ?? 0;
  const scrapAmount = scrapAmountForTier(tier);
  const scrapPrice = scraps?.price;
  const dismantleValue =
    scrapPrice != null && Number.isFinite(scrapPrice) ? scrapPrice * scrapAmount : null;

  const parsedIncl = Number(inclPrice);
  const hasIncl = Number.isFinite(parsedIncl) && parsedIncl > 0;
  const breakdown =
    hasIncl && scrapPrice != null && Number.isFinite(scrapPrice)
      ? calculateProfit({
          scrapPrice,
          scrapAmount,
          inclPrice: parsedIncl,
          taxRate,
        })
      : null;

  const defaultCountryId = pickDefaultCountryId(countries);

  return (
    <section className="mx-auto max-w-[1100px] rounded-md border border-border bg-card p-4 pb-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h1 className="m-0 text-[1.35rem] font-semibold tracking-tight">Calculator</h1>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refreshScrapPrice()}
          disabled={refreshing || loading}
        >
          Refresh scrap price
        </Button>
      </div>

      {error ? <p className="my-2 text-destructive">{error}</p> : null}
      {loading ? <p className="text-muted-foreground">Loading calculator data…</p> : null}

      {!loading ? (
        <>
          <div className="my-3 flex flex-wrap gap-4">
            <div className="flex w-full flex-col gap-1 text-sm text-muted-foreground">
              <span>Tier</span>
              <TierPicker
                value={tier}
                onChange={(next) =>
                  syncSearch({
                    tier: next,
                    countryId,
                    inclPrice,
                    defaultCountryId,
                  })
                }
              />
            </div>

            <div className="flex min-w-40 flex-col gap-1 text-sm text-muted-foreground">
              <span>Country</span>
              <CountrySelect
                countries={countries}
                value={countryId}
                onChange={(next) => {
                  setCountryIdState(next);
                  syncSearch({
                    tier,
                    countryId: next,
                    inclPrice,
                    defaultCountryId,
                  });
                }}
                disabled={countries.length === 0}
              />
            </div>

            <label className="flex flex-col gap-1 text-sm text-muted-foreground">
              Incl. price
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={inclPrice}
                onChange={(e) =>
                  syncSearch({
                    tier,
                    countryId,
                    inclPrice: e.target.value,
                    defaultCountryId,
                  })
                }
                placeholder="e.g. 3.9"
                className="min-w-40"
              />
            </label>
          </div>

          {scraps ? (
            <>
              <div className="my-4 grid max-w-md gap-1.5">
                <div className="flex justify-between gap-4">
                  <span>Dismantle value</span>
                  <span className="font-mono">
                    {dismantleValue != null ? formatNum(dismantleValue) : "—"}
                  </span>
                </div>
                {breakdown ? (
                  <>
                    <div className="flex justify-between gap-4">
                      <span>Incl. price</span>
                      <span className="font-mono">{formatNum(breakdown.inclPrice)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Excl. price</span>
                      <span className="font-mono">{formatNum(breakdown.exclPrice)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Profit</span>
                      <span
                        className={
                          breakdown.profit >= 0
                            ? "font-mono font-semibold text-success"
                            : "font-mono font-semibold text-destructive"
                        }
                      >
                        {formatNum(breakdown.profit)}
                      </span>
                    </div>
                  </>
                ) : null}
              </div>

              <details className="mt-2 max-w-xl">
                <summary className="cursor-pointer text-muted-foreground">
                  Scrap &amp; tax details
                </summary>
                <p className="text-sm text-muted-foreground">
                  Scrap amount: {scrapAmount} · Scrap price: {formatNum(scraps.price)} · Tax:{" "}
                  {(taxRate * 100).toLocaleString(undefined, { maximumFractionDigits: 4 })}% ·
                  Fetched: {formatTs(scraps.fetchedAt)}
                  {scraps.stale ? " · Stale (using cached price after refresh failure)" : ""}
                </p>
              </details>
            </>
          ) : !error ? (
            <p className="text-muted-foreground">No scrap price loaded.</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
