import { Link } from "@tanstack/react-router";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { GoldIcon } from "../../components/GoldIcon";
import { ItemIcon } from "../../components/ItemIcon";
import { formatItem } from "./formatItem";
import type { LatestPriceItem } from "./types";

function formatNum(value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatDisplayNumber(value, digits);
}

function MarketPriceLine({ value }: { value: number | null }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
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
      search={{ range: "7d" }}
      className="block rounded-md border border-border bg-secondary px-3 py-2.5 text-inherit no-underline shadow-none transition-colors hover:border-primary/45 hover:bg-secondary/80"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="grid size-10 shrink-0 place-items-center rounded-md bg-background/60">
          <ItemIcon itemCode={item.itemCode} className="size-7 object-contain" />
        </div>
        <div className="min-w-0">
          <div className="truncate font-semibold leading-tight">{formatItem(item.itemCode)}</div>
          <div className="mt-0.5 text-[0.8rem] leading-tight">
            <MarketPriceLine value={item.marketPrice} />
          </div>
        </div>
      </div>

      <dl className="mt-2.5 grid grid-cols-2 gap-2">
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">Buy</dt>
          <dd className="mt-0.5 mb-0 font-mono text-success">{formatNum(item.buyMax)}</dd>
        </div>
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">Sell</dt>
          <dd className="mt-0.5 mb-0 font-mono text-destructive">{formatNum(item.sellMin)}</dd>
        </div>
      </dl>
    </Link>
  );
}
