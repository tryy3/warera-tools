import { Link } from "@tanstack/react-router";
import type { GearTierId } from "@/calculator";
import { formatEquipmentItem } from "@/equipment/catalog";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { GearItemIcon } from "../../components/GearItemIcon";
import { GoldIcon } from "../../components/GoldIcon";

function formatSpread(spread: number | null | undefined): string {
  if (spread == null || !Number.isFinite(spread)) return "—";
  const abs = formatDisplayNumber(Math.abs(spread));
  if (spread > 0) return `+${abs}`;
  if (spread < 0) return `-${abs}`;
  return abs;
}

function GoldValue({ value }: { value: number | null | undefined }) {
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

function spreadClass(spread: number | null): string {
  if (spread == null || !Number.isFinite(spread)) return "text-muted-foreground";
  if (spread >= 10) return "font-mono text-success";
  if (spread < 3) return "font-mono text-destructive";
  return "font-mono";
}

type Props = {
  itemCode: string;
  tier: GearTierId | null;
  marketMedian: number | null;
  sellerNet: number | null;
  spread: number | null;
  trades: number;
  tradesLabel: string;
};

export function EquipmentItemCard({
  itemCode,
  tier,
  marketMedian,
  sellerNet,
  spread,
  trades,
  tradesLabel,
}: Props) {
  return (
    <Link
      to="/equipment/$itemCode"
      params={{ itemCode }}
      className="block rounded-md border border-border bg-secondary px-3 py-2.5 text-inherit no-underline shadow-none transition-colors hover:border-primary/45 hover:bg-secondary/80"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <GearItemIcon itemCode={itemCode} tier={tier} className="gear-item-icon--lg" />
        <div className="min-w-0 truncate font-semibold leading-tight">
          {formatEquipmentItem(itemCode)}
        </div>
      </div>

      <dl className="mt-2.5 grid grid-cols-2 gap-2">
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Market (incl)
          </dt>
          <dd className="mt-0.5 mb-0">
            <GoldValue value={marketMedian} />
          </dd>
        </div>
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Net (excl)
          </dt>
          <dd className="mt-0.5 mb-0 text-muted-foreground">
            <GoldValue value={sellerNet} />
          </dd>
        </div>
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Spread
          </dt>
          <dd className={`mt-0.5 mb-0 ${spreadClass(spread)}`}>{formatSpread(spread)}</dd>
        </div>
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            {tradesLabel}
          </dt>
          <dd className="mt-0.5 mb-0 font-mono">{trades}</dd>
        </div>
      </dl>
    </Link>
  );
}
