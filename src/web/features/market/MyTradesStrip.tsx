import { Button } from "@/components/ui/button";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { GoldIcon } from "../../components/GoldIcon";
import type { MyTradesResponse } from "./types";

function formatSignedGold(value: number, digits = 4): string {
  const abs = formatDisplayNumber(Math.abs(value), digits);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}

function RealizedPnl({ value }: { value: number | null }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const tone =
    value > 0 ? "text-success" : value < 0 ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono ${tone}`}>
      <GoldIcon />
      {formatSignedGold(value)}
    </span>
  );
}

export function MyTradesStrip({
  noPlayer,
  loading,
  error,
  onRetry,
  data,
}: {
  noPlayer: boolean;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  data: MyTradesResponse | null;
}) {
  if (noPlayer) {
    return (
      <section className="mt-4 rounded-md border border-border/60 bg-background/40 px-3 py-2.5">
        <p className="m-0 text-sm text-muted-foreground">
          Select a player in the shell to see your trades on this chart.
        </p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="mt-4 rounded-md border border-border/60 bg-background/40 px-3 py-2.5">
        <p className="m-0 text-sm text-muted-foreground">Loading your trades…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-4 rounded-md border border-border/60 bg-background/40 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 text-sm text-destructive">{error}</p>
          {onRetry ? (
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  if (!data || data.chunks.length === 0) {
    return (
      <section className="mt-4 rounded-md border border-border/60 bg-background/40 px-3 py-2.5">
        <p className="m-0 text-sm text-muted-foreground">No trades in this range.</p>
      </section>
    );
  }

  let buyChunks = 0;
  let sellChunks = 0;
  for (const chunk of data.chunks) {
    if (chunk.side === "buy") buyChunks += 1;
    else sellChunks += 1;
  }

  return (
    <section className="mt-4 rounded-md border border-border/60 bg-background/40 px-3 py-2.5">
      <h2 className="mb-2 text-sm font-medium tracking-tight">Your trades</h2>
      <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Realized P/L
          </dt>
          <dd className="mt-0.5 mb-0">
            <RealizedPnl value={data.realized.pnl} />
          </dd>
        </div>
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Buy chunks
          </dt>
          <dd className="mt-0.5 mb-0 font-mono">{buyChunks}</dd>
        </div>
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Sell chunks
          </dt>
          <dd className="mt-0.5 mb-0 font-mono">{sellChunks}</dd>
        </div>
      </dl>
      {data.historyIncomplete ? (
        <p className="mt-2 mb-0 text-sm text-amber-200/90">
          Trade history looks incomplete — earlier buys may be missing, so P/L can be wrong.
        </p>
      ) : null}
    </section>
  );
}
