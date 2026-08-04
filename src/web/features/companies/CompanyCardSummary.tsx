import { Badge } from "@/components/ui/badge";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { FlagIcon } from "../../components/FlagIcon";
import { GoldIcon } from "../../components/GoldIcon";
import { ItemIcon } from "../../components/ItemIcon";
import type { DerivedCompanyCard } from "./sim/derive";
import type { CompanyAdvisorRow } from "./types";

function formatItem(code: string): string {
  return code.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function formatNum(value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatDisplayNumber(value, digits);
}

function WageGrossNet({
  gross,
  net,
  digits = 4,
}: {
  gross: number | null | undefined;
  net: number | null | undefined;
  digits?: number;
}) {
  if (gross == null || net == null || !Number.isFinite(gross) || !Number.isFinite(net)) {
    return "—";
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <GoldIcon />
      {formatDisplayNumber(gross, digits)}
      <span className="text-muted-foreground">|</span>
      {formatDisplayNumber(net, digits)}
    </span>
  );
}

function GoldPerDay({ value, digits = 3 }: { value: number; digits?: number }) {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return (
    <span className="inline-flex items-center gap-1.5">
      <GoldIcon />
      {sign}
      {formatDisplayNumber(value, digits)}/day
    </span>
  );
}

export function CompanyCardSummary({
  row,
  summary,
  aeLevel,
  productionBonus,
}: {
  row: CompanyAdvisorRow;
  summary: DerivedCompanyCard;
  aeLevel: number;
  productionBonus: number | null;
}) {
  const bonusPct = productionBonus != null ? productionBonus * 100 : null;

  return (
    <>
      <div className="flex flex-row items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{row.company.name}</h3>
            {summary.dirty ? (
              <Badge variant="outline" className="border-amber-500/45 font-normal text-amber-200">
                Dirty
              </Badge>
            ) : null}
            {summary.workersStatus === "unavailable" ? (
              <Badge
                variant="outline"
                className="border-muted-foreground/40 font-normal text-muted-foreground"
              >
                Workers unavailable
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 mb-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
            {row.company.itemCode ? (
              <span className="inline-flex items-center gap-1">
                <ItemIcon itemCode={row.company.itemCode} />
                {formatItem(row.company.itemCode)}
              </span>
            ) : (
              "—"
            )}
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <FlagIcon code={row.company.regionCountryCode} />
              {row.company.regionName ?? row.company.regionId ?? "—"}
            </span>
            <span aria-hidden>·</span>
            <span>AE {aeLevel}</span>
            <span aria-hidden>·</span>
            <span>Bonus {bonusPct != null ? `${formatNum(bonusPct, 1)}%` : "—"}</span>
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 border-success/45 font-normal text-success">
          <GoldPerDay value={summary.day.netPerDay} />
        </Badge>
      </div>

      <dl className="m-0 mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-x-3.5 gap-y-1.5">
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Active workers
          </dt>
          <dd className="mt-0.5 mb-0">{summary.activeWorkerCount}</dd>
        </div>
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Max wage @0% fid
          </dt>
          <dd className="mt-0.5 mb-0">
            <WageGrossNet gross={summary.maxWage.gross} net={summary.maxWage.net} />
          </dd>
        </div>
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Offer wage
          </dt>
          <dd className="mt-0.5 mb-0">
            <WageGrossNet gross={summary.offerWage?.gross} net={summary.offerWage?.net} />
          </dd>
        </div>
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Net @10% fid
          </dt>
          <dd className="mt-0.5 mb-0">
            <GoldPerDay value={summary.day.netPerDayAtMaxWorkerFidelity} />
          </dd>
        </div>
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Profit/PP
          </dt>
          <dd className="mt-0.5 mb-0">
            {row.currentProfitPerPp != null && Number.isFinite(row.currentProfitPerPp) ? (
              <span className="inline-flex items-center gap-1.5">
                <GoldIcon />
                {formatDisplayNumber(row.currentProfitPerPp, 4)}
              </span>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
            Daily PP
          </dt>
          <dd className="mt-0.5 mb-0">
            {row.aeBreakdown ? formatNum(row.aeBreakdown.dailyPp, 1) : "—"}
          </dd>
        </div>
      </dl>
    </>
  );
}
