import { Sigma } from "lucide-react";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { GoldIcon } from "../../components/GoldIcon";

type ResultPanelProps = {
  totalQuote: number;
  quotedCount: number;
  quotePending: boolean;
};

export function ResultPanel({ totalQuote, quotedCount, quotePending }: ResultPanelProps) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <p className="mb-1 text-xs tracking-[0.14em] text-muted-foreground uppercase">Build result</p>
      <h2 className="m-0 text-lg font-semibold">Tax-included loadout</h2>

      <div className="mt-8 rounded-xl border border-amber-300/20 bg-amber-300/5 px-5 py-7 text-center">
        <p className="m-0 text-xs tracking-[0.14em] text-amber-100/70 uppercase">
          Market quote sum
        </p>
        <p className="mt-3 mb-0 flex items-center justify-center gap-2 font-mono text-3xl font-semibold text-amber-200 tabular-nums">
          <Sigma className="size-6" aria-hidden />
          {quotePending ? (
            <span className="text-lg text-muted-foreground">Pricing…</span>
          ) : quotedCount > 0 ? (
            <>
              <GoldIcon />
              {formatDisplayNumber(totalQuote)}
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </p>
      </div>

      <div className="mt-5 rounded-xl border border-dashed border-border px-5 py-10 text-center">
        <p className="m-0 text-sm font-medium">Damage</p>
        <p className="mt-1 mb-0 text-sm text-muted-foreground">coming later</p>
      </div>
    </section>
  );
}
