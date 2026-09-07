import {
  LOADOUT_SLOT_ORDER,
  type Loadout,
  type LoadoutItem,
  type LoadoutSlotId,
} from "@/battle-build/slots";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { GoldIcon } from "../../components/GoldIcon";
import { SlotCard } from "./SlotCard";
import { sumLoadoutQuotes, type useLoadoutQuotes } from "./useLoadoutQuotes";

type LoadoutRowProps = {
  loadout: Loadout;
  importing: boolean;
  quoteState: ReturnType<typeof useLoadoutQuotes>;
  onChange: (loadout: Loadout) => void;
};

export function LoadoutRow({ loadout, importing, quoteState, onChange }: LoadoutRowProps) {
  const { quoteBySlot, quotes, pending, error } = quoteState;
  const { total, quotedCount } = sumLoadoutQuotes(quotes);

  function changeSlot(slot: LoadoutSlotId, item: LoadoutItem | null) {
    onChange({ ...loadout, [slot]: item });
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
            Current loadout
          </p>
          <h2 className="text-lg font-semibold">Equipment and supplies</h2>
        </div>
        <div className="text-right">
          <p className="m-0 text-[0.68rem] tracking-[0.12em] text-muted-foreground uppercase">
            Tax-included total
          </p>
          <p className="mt-1 mb-0 inline-flex items-center gap-1 font-mono text-sm tabular-nums">
            <span aria-hidden>Σ</span>
            {importing || pending ? (
              <span className="text-muted-foreground">Pricing…</span>
            ) : quotedCount > 0 ? (
              <>
                <GoldIcon />
                {formatDisplayNumber(total)}
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </p>
        </div>
      </div>

      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {LOADOUT_SLOT_ORDER.map((slot) => (
          <SlotCard
            key={slot}
            slot={slot}
            item={loadout[slot]}
            quote={quoteBySlot[slot] ?? null}
            quotePending={pending}
            onChange={(item) => changeSlot(slot, item)}
          />
        ))}
      </div>
    </section>
  );
}
