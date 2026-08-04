import type { ReactNode } from "react";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import type { CompanyDayResult } from "../../../economy/workers";
import { GoldIcon } from "../../components/GoldIcon";

function formatNum(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatDisplayNumber(value, digits);
}

function GoldCell({
  value,
  digits = 3,
  signed = false,
}: {
  value: number | null | undefined;
  digits?: number;
  signed?: boolean;
}) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = signed && value > 0 ? "+" : "";
  return (
    <span className="inline-flex items-center gap-1 text-foreground">
      <GoldIcon />
      {sign}
      {formatDisplayNumber(value, digits)}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="m-0 text-muted-foreground">{label}</dt>
      <dd className="m-0 text-right text-foreground">{children}</dd>
    </div>
  );
}

export function CompanyDailyBreakdown({
  day,
  incomeTaxAssumed,
  assumedWorkerFields,
}: {
  day: CompanyDayResult;
  incomeTaxAssumed: boolean;
  assumedWorkerFields: string[];
}) {
  const workerPp = day.workers.reduce((sum, w) => sum + w.current.effectivePpPerDay, 0);
  const showAssumedNote = incomeTaxAssumed || assumedWorkerFields.length > 0;

  return (
    <div>
      <dl className="m-0 flex flex-col gap-1">
        <Row label="AE">
          {formatNum(day.aeDailyPp, 1)} PP · <GoldCell value={day.aeDailyValue} />
        </Row>
        <Row label="Self-work">
          {formatNum(day.selfWorkDailyPp, 1)} PP · <GoldCell value={day.selfWorkDailyValue} />
        </Row>
        <Row label="Worker PP">{formatNum(workerPp, 1)}</Row>
        <Row label="Units">{day.unitsProduced != null ? formatNum(day.unitsProduced, 2) : "—"}</Row>
        <Row label="Revenue">
          <GoldCell value={day.revenuePerDay} />
        </Row>
        <Row label="Wage costs">
          <GoldCell value={day.workerWageCostPerDay} />
        </Row>
        <Row label="Input costs">
          <GoldCell value={day.inputCostPerDay} />
        </Row>
        <Row label="Net">
          <GoldCell value={day.netPerDay} signed />
        </Row>
      </dl>

      {showAssumedNote ? (
        <p className="mt-2 mb-0 text-[0.8em] text-muted-foreground">
          {incomeTaxAssumed ? "Income tax rate assumed. " : null}
          {assumedWorkerFields.length > 0
            ? `Worker fields assumed: ${[...new Set(assumedWorkerFields)].join(", ")}.`
            : null}
        </p>
      ) : null}
    </div>
  );
}
