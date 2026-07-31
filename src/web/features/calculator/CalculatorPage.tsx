import { useEffect, useState } from "react";
import { calculateProfit, scrapAmountForTier, type GearTierId } from "@/calculator";
import { api } from "../../api";
import { CountrySelect } from "./CountrySelect";
import { TierPicker } from "./TierPicker";
import type { CountriesResponse, Country, ScrapsResponse } from "./types";

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
  if (countries.some((c) => c.id === "sweden")) return "sweden";
  return countries[0]?.id ?? "";
}

export function CalculatorPage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [scraps, setScraps] = useState<ScrapsResponse | null>(null);
  const [tier, setTier] = useState<GearTierId>("green");
  const [countryId, setCountryId] = useState("");
  const [inclPrice, setInclPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setCountryId((prev) => {
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

  return (
    <section className="page">
      <div className="page-header">
        <h1>Calculator</h1>
        <button
          type="button"
          onClick={() => void refreshScrapPrice()}
          disabled={refreshing || loading}
        >
          Refresh scrap price
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Loading calculator data…</p> : null}

      {!loading ? (
        <>
          <div className="calc-controls">
            <label className="calc-control-tier">
              Tier
              <TierPicker value={tier} onChange={setTier} />
            </label>

            <label>
              Country
              <CountrySelect
                countries={countries}
                value={countryId}
                onChange={setCountryId}
                disabled={countries.length === 0}
              />
            </label>

            <label>
              Incl. price
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={inclPrice}
                onChange={(e) => setInclPrice(e.target.value)}
                placeholder="e.g. 3.9"
              />
            </label>
          </div>

          {scraps ? (
            <>
              <div className="calc-breakdown">
                <div className="calc-row">
                  <span>Dismantle value</span>
                  <span className="mono">
                    {dismantleValue != null ? formatNum(dismantleValue) : "—"}
                  </span>
                </div>
                {breakdown ? (
                  <>
                    <div className="calc-row">
                      <span>Incl. price</span>
                      <span className="mono">{formatNum(breakdown.inclPrice)}</span>
                    </div>
                    <div className="calc-row">
                      <span>Excl. price</span>
                      <span className="mono">{formatNum(breakdown.exclPrice)}</span>
                    </div>
                    <div className="calc-row">
                      <span>Profit</span>
                      <span
                        className={
                          breakdown.profit >= 0 ? "mono profit-positive" : "mono profit-negative"
                        }
                      >
                        {formatNum(breakdown.profit)}
                      </span>
                    </div>
                  </>
                ) : null}
              </div>

              <details className="calc-details">
                <summary>Scrap &amp; tax details</summary>
                <p className="muted small">
                  Scrap amount: {scrapAmount} · Scrap price: {formatNum(scraps.price)} · Tax:{" "}
                  {(taxRate * 100).toLocaleString(undefined, { maximumFractionDigits: 4 })}% ·
                  Fetched: {formatTs(scraps.fetchedAt)}
                  {scraps.stale ? " · Stale (using cached price after refresh failure)" : ""}
                </p>
              </details>
            </>
          ) : !error ? (
            <p className="muted">No scrap price loaded.</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
