import { getRouteApi, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { PRICE_HISTORY_RANGES, type PriceHistoryRange } from "@/market/ranges";
import { ApiError, api } from "../../api";
import { GoldIcon } from "../../components/GoldIcon";
import { ItemIcon } from "../../components/ItemIcon";
import { usePlayerSelection } from "../../player/player-selection";
import { formatItem } from "./formatItem";
import { MarketPriceChart, type TradeDot } from "./MarketPriceChart";
import { MyTradesStrip } from "./MyTradesStrip";
import type { MyTradesResponse, PriceChangeDto, PriceHistoryResponse } from "./types";

const marketItemRoute = getRouteApi("/market_/$itemCode");

function formatNum(value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatDisplayNumber(value, digits);
}

function GoldAmount({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) return "—";
  return (
    <span className="inline-flex items-center gap-1.5">
      <GoldIcon />
      {formatDisplayNumber(value)}
    </span>
  );
}

function formatSigned(value: number, digits = 4): string {
  const abs = formatDisplayNumber(Math.abs(value), digits);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}

function ChangeStat({ label, change }: { label: string; change: PriceChangeDto | null }) {
  if (!change) {
    return (
      <div>
        <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">{label}</dt>
        <dd className="mt-0.5 mb-0 text-muted-foreground">—</dd>
      </div>
    );
  }

  const tone =
    change.absolute > 0
      ? "text-success"
      : change.absolute < 0
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <div>
      <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className={`mt-0.5 mb-0 font-mono ${tone}`}>
        {formatSigned(change.absolute)} ({formatSigned(change.percent, 2)}%)
      </dd>
    </div>
  );
}

async function fetchPriceHistory(
  itemCode: string,
  range: PriceHistoryRange,
): Promise<PriceHistoryResponse> {
  return api<PriceHistoryResponse>(
    `/api/prices/history?itemCode=${encodeURIComponent(itemCode)}&range=${encodeURIComponent(range)}`,
  );
}

async function fetchMyTrades(
  itemCode: string,
  playerId: string,
  range: PriceHistoryRange,
): Promise<MyTradesResponse> {
  return api<MyTradesResponse>(
    `/api/market/${encodeURIComponent(itemCode)}/my-trades?playerId=${encodeURIComponent(playerId)}&range=${encodeURIComponent(range)}`,
  );
}

function formatChunkClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatChunkTimeSpan(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const startClock = formatChunkClock(startAt);
  const endClock = formatChunkClock(endAt);
  if (start.toDateString() === end.toDateString()) {
    return startClock === endClock ? startClock : `${startClock}–${endClock}`;
  }
  const dateOpts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  return `${start.toLocaleString(undefined, dateOpts)}–${end.toLocaleString(undefined, dateOpts)}`;
}

function chunksToTradeDots(chunks: MyTradesResponse["chunks"]): TradeDot[] {
  return chunks.map((chunk) => {
    const startMs = Date.parse(chunk.startAt);
    const endMs = Date.parse(chunk.endAt);
    const midMs = (startMs + endMs) / 2;
    const sideLabel = chunk.side === "buy" ? "Buy" : "Sell";
    const fillLabel = chunk.fillCount === 1 ? "1 fill" : `${chunk.fillCount} fills`;
    return {
      date: new Date(midMs),
      price: chunk.unitPrice,
      side: chunk.side,
      label: `${sideLabel} ${chunk.totalQty} @ ${chunk.unitPrice} · ${fillLabel} · ${formatChunkTimeSpan(chunk.startAt, chunk.endAt)}`,
    };
  });
}

export function MarketItemPage() {
  const { itemCode } = marketItemRoute.useParams();
  const { range } = marketItemRoute.useSearch();
  const navigate = marketItemRoute.useNavigate();
  const { player } = usePlayerSelection();
  const playerId = player?.userId ?? null;

  const [data, setData] = useState<PriceHistoryResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const historyKey = `${itemCode}:${range}:${reloadToken}`;
  const [readyHistoryKey, setReadyHistoryKey] = useState<string | null>(null);
  const loading = readyHistoryKey !== historyKey;

  const [trades, setTrades] = useState<MyTradesResponse | null>(null);
  const [tradesError, setTradesError] = useState<string | null>(null);
  const [tradesReloadToken, setTradesReloadToken] = useState(0);
  const tradesKey = playerId ? `${itemCode}:${range}:${playerId}:${tradesReloadToken}` : null;
  const [readyTradesKey, setReadyTradesKey] = useState<string | null>(null);
  const tradesLoading = tradesKey != null && readyTradesKey !== tradesKey;

  useEffect(() => {
    let cancelled = false;

    void fetchPriceHistory(itemCode, range)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
        setNotFound(false);
        setReadyHistoryKey(historyKey);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.code === "not_found")) {
          setNotFound(true);
          setError(null);
          setData(null);
          setReadyHistoryKey(historyKey);
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
        setNotFound(false);
        setData(null);
        setReadyHistoryKey(historyKey);
      });

    return () => {
      cancelled = true;
    };
  }, [itemCode, range, reloadToken, historyKey]);

  useEffect(() => {
    if (!playerId || !tradesKey) return;

    let cancelled = false;

    void fetchMyTrades(itemCode, playerId, range)
      .then((result) => {
        if (cancelled) return;
        setTrades(result);
        setTradesError(null);
        setReadyTradesKey(tradesKey);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTradesError(err instanceof Error ? err.message : String(err));
        setTrades(null);
        setReadyTradesKey(tradesKey);
      });

    return () => {
      cancelled = true;
    };
  }, [itemCode, range, playerId, tradesReloadToken, tradesKey]);

  const activeTrades = playerId ? trades : null;
  const tradeDots = useMemo(
    () => (activeTrades?.chunks.length ? chunksToTradeDots(activeTrades.chunks) : undefined),
    [activeTrades],
  );

  function setRange(next: PriceHistoryRange) {
    void navigate({ search: { range: next }, replace: true });
  }

  const itemLabel = formatItem(itemCode);
  const latest = data?.latest ?? null;

  return (
    <div className="mx-auto max-w-[1200px] rounded-md border border-border bg-card p-4 pb-6">
      <div className="mb-3">
        <Link
          to="/market"
          className="text-sm text-muted-foreground no-underline hover:text-foreground"
        >
          ← Back to Market
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <ItemIcon itemCode={itemCode} />
          <div className="min-w-0">
            <h1 className="mb-0.5 truncate text-[1.35rem] font-semibold tracking-tight">
              {itemLabel}
            </h1>
            <p className="m-0 text-sm text-muted-foreground">{itemCode}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1" role="group" aria-label="History range">
          {PRICE_HISTORY_RANGES.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={option === range ? "default" : "outline"}
              aria-pressed={option === range}
              onClick={() => setRange(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      </div>

      {loading ? <p className="text-muted-foreground">Loading price history…</p> : null}

      {!loading && notFound ? (
        <p className="text-muted-foreground">Item not found or no price history yet.</p>
      ) : null}

      {!loading && error ? (
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

      {!loading && !notFound && !error && data ? (
        <>
          <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                Market
              </dt>
              <dd className="mt-0.5 mb-0 font-mono">
                <GoldAmount value={latest?.marketPrice} />
              </dd>
            </div>
            <div>
              <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                Top buy
              </dt>
              <dd className="mt-0.5 mb-0 font-mono text-success">{formatNum(latest?.topBuy)}</dd>
            </div>
            <div>
              <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                Top sell
              </dt>
              <dd className="mt-0.5 mb-0 font-mono text-destructive">
                {formatNum(latest?.topSell)}
              </dd>
            </div>
            <ChangeStat label="Δ 24h" change={data.change24h} />
            <ChangeStat label="Δ 7d" change={data.change7d} />
          </dl>

          {data.points.length < 3 ? (
            <p className="mb-3 text-sm text-muted-foreground">
              Limited history — more points appear as polls accumulate.
            </p>
          ) : null}

          <MarketPriceChart points={data.points} itemLabel={itemLabel} tradeDots={tradeDots} />
        </>
      ) : null}

      <MyTradesStrip
        noPlayer={!playerId}
        loading={Boolean(playerId) && tradesLoading}
        error={playerId ? tradesError : null}
        onRetry={() => setTradesReloadToken((token) => token + 1)}
        data={activeTrades}
      />
    </div>
  );
}
