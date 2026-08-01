import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { GoldIcon } from "../../components/GoldIcon";
import { ItemIcon } from "../../components/ItemIcon";
import type { LatestPriceItem } from "./types";

function formatItem(code: string): string {
  return code.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function formatNum(value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatDisplayNumber(value, digits);
}

function GoldAmount({ value }: { value: number | null }) {
  if (value == null || !Number.isFinite(value)) return "—";
  return (
    <span className="inline-flex items-center gap-1.5">
      <GoldIcon />
      {formatDisplayNumber(value)}
    </span>
  );
}

type Props = {
  item: LatestPriceItem;
};

export function MarketItemCard({ item }: Props) {
  return (
    <Link
      to="/market/$itemCode"
      params={{ itemCode: item.itemCode }}
      className="block rounded-md border border-border bg-secondary px-3.5 py-3 text-inherit no-underline shadow-none transition-colors hover:border-primary/45 hover:bg-secondary/80"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ItemIcon itemCode={item.itemCode} />
          <span className="truncate font-semibold">{formatItem(item.itemCode)}</span>
        </div>
        <Badge variant="outline" className="shrink-0 border-border font-normal">
          <GoldAmount value={item.marketPrice} />
        </Badge>
      </div>

      <dl className="mt-2.5 grid grid-cols-2 gap-2">
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Top buy
          </dt>
          <dd className="mt-0.5 mb-0 font-mono text-success">{formatNum(item.buyMax)}</dd>
        </div>
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Top sell
          </dt>
          <dd className="mt-0.5 mb-0 font-mono text-destructive">{formatNum(item.sellMin)}</dd>
        </div>
      </dl>
    </Link>
  );
}
