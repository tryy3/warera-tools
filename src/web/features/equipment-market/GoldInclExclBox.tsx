import type { ReactNode } from "react";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { moneyToNumber } from "@/money/decimal";
import { GoldIcon } from "../../components/GoldIcon";

export const EQUIPMENT_GOLD_DIGITS = 3;

function GoldLine({ value }: { value: string | number | null | undefined }) {
  const n = moneyToNumber(value);
  if (n == null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 font-mono">
      <GoldIcon />
      {formatDisplayNumber(n, EQUIPMENT_GOLD_DIGITS)}
    </span>
  );
}

export function GoldInclExclBox({
  label,
  incl,
  excl,
  children,
}: {
  label: string;
  incl: string | number | null | undefined;
  excl: string | number | null | undefined;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
      <div className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-1">
        <GoldLine value={incl} />
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="text-[0.7em] tracking-wide uppercase">excl</span>
        <GoldLine value={excl} />
      </div>
      {children}
    </div>
  );
}
