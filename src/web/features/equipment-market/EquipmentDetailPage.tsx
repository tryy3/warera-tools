import { getRouteApi, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { equipmentTierShortLabel, formatEquipmentItem } from "@/equipment/catalog";
import type { SkillBand } from "@/equipment/skills";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { ApiError, api } from "../../api";
import { GearItemIcon } from "../../components/GearItemIcon";
import { GoldIcon } from "../../components/GoldIcon";
import { loadEquipmentCountryId, saveEquipmentCountryId } from "../../lib/equipmentPrefs";
import { loadStats, saveStoredEquipmentStats } from "../../lib/equipmentStats";
import { CountrySelect } from "../calculator/CountrySelect";
import { EquipmentLadderChart } from "./EquipmentLadderChart";
import { EquipmentTrendChart } from "./EquipmentTrendChart";
import { SkillBandControls } from "./SkillBandControls";
import type { CountriesResponse, Country, DetailResponse } from "./types";

const equipmentDetailRoute = getRouteApi("/equipment_/$itemCode");

const BAND_DEBOUNCE_MS = 200;

function pickDefaultCountryId(countries: Country[]): string {
  return countries.find((c) => c.isoCode === "SE")?.id ?? countries[0]?.id ?? "";
}

function GoldAmount({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 font-mono">
      <GoldIcon />
      {formatDisplayNumber(value)}
    </span>
  );
}

function bandsToStored(bands: SkillBand[]) {
  return {
    targets: Object.fromEntries(bands.map((b) => [b.key, b.target])),
    bands: Object.fromEntries(bands.map((b) => [b.key, b.band])),
  };
}

function detailUrl(itemCode: string, bands: SkillBand[] | null, countryId: string): string {
  const params = new URLSearchParams();
  if (bands != null && bands.length > 0) {
    params.set("skills", JSON.stringify(bands));
  }
  if (countryId) params.set("countryId", countryId);
  const qs = params.toString();
  return `/api/equipment/${encodeURIComponent(itemCode)}${qs ? `?${qs}` : ""}`;
}

function marketVsRecommend(
  marketMedian: number | null,
  recommend: DetailResponse["recommend"],
): string | null {
  if (marketMedian == null || recommend == null) return null;
  const vsAttractive = marketMedian - recommend.attractiveIncl;
  const vsBreakEven = marketMedian - recommend.breakEvenIncl;
  if (Math.abs(vsAttractive) < 1e-9) return "Market equals attractive list";
  if (vsAttractive > 0) {
    return `Market ${formatDisplayNumber(vsAttractive)} above attractive`;
  }
  if (vsBreakEven >= 0) {
    return `Market ${formatDisplayNumber(-vsAttractive)} below attractive (above break-even)`;
  }
  return `Market ${formatDisplayNumber(-vsBreakEven)} below break-even`;
}

export function EquipmentDetailPage() {
  const { itemCode } = equipmentDetailRoute.useParams();

  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [bands, setBands] = useState<SkillBand[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryId, setCountryId] = useState("");
  const [showSellerNet, setShowSellerNet] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const countryIdRef = useRef(countryId);
  countryIdRef.current = countryId;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetchGenRef.current += 1;
    const gen = fetchGenRef.current;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    async function load() {
      setLoading(true);
      setError(null);
      setNotFound(false);
      setDetail(null);
      setBands([]);

      try {
        const [countriesData, bootstrap] = await Promise.all([
          api<CountriesResponse>("/api/countries"),
          api<DetailResponse>(detailUrl(itemCode, null, "")),
        ]);
        if (cancelled || gen !== fetchGenRef.current) return;

        setCountries(countriesData.countries);
        const saved = loadEquipmentCountryId();
        const nextCountry =
          saved && countriesData.countries.some((c) => c.id === saved)
            ? saved
            : pickDefaultCountryId(countriesData.countries);
        setCountryId(nextCountry);
        countryIdRef.current = nextCountry;

        const nextBands = loadStats(itemCode, bootstrap.lowestObserved);
        setBands(nextBands);

        const withSkills = await api<DetailResponse>(detailUrl(itemCode, nextBands, nextCountry));
        if (cancelled || gen !== fetchGenRef.current) return;
        setDetail(withSkills);
      } catch (err) {
        if (cancelled || gen !== fetchGenRef.current) return;
        if (err instanceof ApiError && (err.status === 404 || err.code === "not_found")) {
          setNotFound(true);
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled && gen === fetchGenRef.current) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [itemCode]);

  async function refetchWith(nextBands: SkillBand[], nextCountryId: string) {
    fetchGenRef.current += 1;
    const gen = fetchGenRef.current;
    setRefreshing(true);
    setError(null);
    try {
      const result = await api<DetailResponse>(detailUrl(itemCode, nextBands, nextCountryId));
      if (gen !== fetchGenRef.current) return;
      setDetail(result);
    } catch (err) {
      if (gen !== fetchGenRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (gen === fetchGenRef.current) setRefreshing(false);
    }
  }

  function onBandsChange(next: SkillBand[]) {
    setBands(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      saveStoredEquipmentStats(itemCode, bandsToStored(next));
      void refetchWith(next, countryIdRef.current);
    }, BAND_DEBOUNCE_MS);
  }

  function onCountryChange(next: string) {
    setCountryId(next);
    countryIdRef.current = next;
    saveEquipmentCountryId(next);
    void refetchWith(bands, next);
  }

  const taxRate = detail?.taxRate ?? null;
  const taxMissing = taxRate == null;
  const selectedCountry = countries.find((c) => c.id === countryId) ?? null;
  const taxPct =
    selectedCountry != null
      ? formatDisplayNumber(selectedCountry.taxRate * 100, 2)
      : taxRate != null
        ? formatDisplayNumber(taxRate * 100, 2)
        : null;
  const vsMarket = marketVsRecommend(detail?.marketMedian ?? null, detail?.recommend ?? null);

  return (
    <div className="mx-auto max-w-[1200px] rounded-md border border-border bg-card p-4 pb-6">
      <div className="mb-3">
        <Link
          to="/equipment"
          className="text-sm text-muted-foreground no-underline hover:text-foreground"
        >
          ← Back to Equipment
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <GearItemIcon
            itemCode={itemCode}
            tier={detail?.tier ?? null}
            className="gear-item-icon--lg"
          />
          <div className="min-w-0">
            <h1 className="mb-0.5 truncate text-[1.35rem] font-semibold tracking-tight">
              {formatEquipmentItem(itemCode)}
            </h1>
            <p className="m-0 text-sm text-muted-foreground">
              {detail ? equipmentTierShortLabel(detail.tier) : null}
              {detail != null ? ` · ${detail.trades} trades in band` : null}
              {refreshing ? " · updating…" : null}
            </p>
          </div>
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

      {error ? <p className="my-2 text-destructive">{error}</p> : null}
      {loading ? <p className="text-muted-foreground">Loading equipment detail…</p> : null}
      {notFound ? <p className="text-muted-foreground">Item not found.</p> : null}

      {!loading && !notFound ? (
        <>
          <section className="mt-2">
            <h2 className="mt-0 mb-2 text-[1.05rem] font-semibold">Skill bands</h2>
            <SkillBandControls bands={bands} onChange={onBandsChange} disabled={loading} />
          </section>

          <section className="mt-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-[1.05rem] font-semibold">Price triad</h2>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowSellerNet((v) => !v)}
                disabled={taxMissing}
              >
                {showSellerNet ? "Hide seller excl" : "Show seller excl"}
              </Button>
            </div>

            {taxMissing ? (
              <p className="mb-2 text-sm text-amber-200/90">
                Pick a country to unlock seller net and recommend pricing.
              </p>
            ) : null}

            {detail?.scrapPrice == null ? (
              <p className="mb-2 text-sm text-amber-200/90">
                Scrap price missing — floor and recommend unavailable.
              </p>
            ) : null}

            <dl className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
                <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                  Market incl
                </dt>
                <dd className="mt-1 mb-0">
                  <GoldAmount value={detail?.marketMedian} />
                </dd>
              </div>
              {showSellerNet && !taxMissing ? (
                <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
                  <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                    Seller excl
                  </dt>
                  <dd className="mt-1 mb-0">
                    <GoldAmount value={detail?.sellerNet} />
                  </dd>
                </div>
              ) : null}
              <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
                <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                  Scrap floor
                </dt>
                <dd className="mt-1 mb-0">
                  <GoldAmount value={detail?.scrapFloor} />
                </dd>
              </div>
            </dl>
          </section>

          <section className="mt-5">
            <h2 className="mt-0 mb-2 text-[1.05rem] font-semibold">Recommend</h2>
            {taxMissing ? (
              <p className="m-0 text-sm text-muted-foreground">
                Recommend strip needs a country tax rate.
              </p>
            ) : detail?.recommend == null ? (
              <p className="m-0 text-sm text-muted-foreground">
                Recommend unavailable (need tier + scrap price).
              </p>
            ) : (
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
                  <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                    Break-even incl
                  </dt>
                  <dd className="mt-1 mb-0">
                    <GoldAmount value={detail.recommend.breakEvenIncl} />
                  </dd>
                </div>
                <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
                  <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                    Attractive (+5%)
                  </dt>
                  <dd className="mt-1 mb-0">
                    <GoldAmount value={detail.recommend.attractiveIncl} />
                  </dd>
                </div>
                <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
                  <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                    Market incl
                  </dt>
                  <dd className="mt-1 mb-0">
                    <GoldAmount value={detail.marketMedian} />
                  </dd>
                </div>
                <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2 sm:col-span-2 lg:col-span-1">
                  <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                    Vs market
                  </dt>
                  <dd className="mt-1 mb-0 text-sm">
                    {vsMarket ?? <span className="text-muted-foreground">—</span>}
                  </dd>
                </div>
              </dl>
            )}
          </section>

          <section className="mt-5">
            <h2 className="mt-0 mb-2 text-[1.05rem] font-semibold">Daily median trend</h2>
            <EquipmentTrendChart
              dailyMedians={detail?.dailyMedians ?? []}
              scrapFloor={detail?.scrapFloor}
              itemLabel={formatEquipmentItem(itemCode)}
            />
          </section>

          <section className="mt-5">
            <h2 className="mt-0 mb-2 text-[1.05rem] font-semibold">
              Stat ladder
              {detail?.skillKeys[0] ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({detail.skillKeys[0]})
                </span>
              ) : null}
            </h2>
            <EquipmentLadderChart
              ladder={detail?.ladder ?? []}
              itemLabel={formatEquipmentItem(itemCode)}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
