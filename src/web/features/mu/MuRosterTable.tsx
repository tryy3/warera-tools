import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import type { MemberHistoryMetric } from "../../../mu/metrics";
import { formatMuMetricLabel } from "./formatMu";
import type { MuDetailMember } from "./types";

type SortKey = "label" | "role" | "metric";
type SortDir = "asc" | "desc";

function memberLabel(member: MuDetailMember): string {
  return member.username ?? member.userId.slice(0, 8);
}

function metricValue(member: MuDetailMember, metric: MemberHistoryMetric): number | null {
  const value = member.latest?.[metric];
  return value != null && Number.isFinite(value) ? value : null;
}

function SortIcon({ sorted }: { sorted: false | SortDir }) {
  if (sorted === "asc") return <ArrowUp className="size-3.5 opacity-70" aria-hidden />;
  if (sorted === "desc") return <ArrowDown className="size-3.5 opacity-70" aria-hidden />;
  return <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />;
}

function compareNullable(a: number | null, b: number | null, dir: SortDir): number {
  const aOk = a != null;
  const bOk = b != null;
  if (!aOk && !bOk) return 0;
  if (!aOk) return 1;
  if (!bOk) return -1;
  const cmp = a === b ? 0 : a < b ? -1 : 1;
  return dir === "asc" ? cmp : -cmp;
}

export function MuRosterTable({
  members,
  memberMetric,
}: {
  members: MuDetailMember[];
  memberMetric: MemberHistoryMetric;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("metric");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const metricLabel = formatMuMetricLabel(memberMetric);

  const sorted = useMemo(() => {
    const rows = [...members];
    rows.sort((a, b) => {
      if (sortKey === "label") {
        const cmp = memberLabel(a).localeCompare(memberLabel(b));
        return sortDir === "asc" ? cmp : -cmp;
      }
      if (sortKey === "role") {
        const cmp = (a.role ?? "").localeCompare(b.role ?? "");
        return sortDir === "asc" ? cmp : -cmp;
      }
      return compareNullable(metricValue(a, memberMetric), metricValue(b, memberMetric), sortDir);
    });
    return rows;
  }, [members, memberMetric, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "metric" ? "desc" : "asc");
  }

  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">No roster members yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2.5 h-8 gap-1 px-2.5 font-medium text-foreground"
              onClick={() => toggleSort("label")}
            >
              Member
              <SortIcon sorted={sortKey === "label" ? sortDir : false} />
            </Button>
          </TableHead>
          <TableHead>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2.5 h-8 gap-1 px-2.5 font-medium text-foreground"
              onClick={() => toggleSort("role")}
            >
              Role
              <SortIcon sorted={sortKey === "role" ? sortDir : false} />
            </Button>
          </TableHead>
          <TableHead className="text-right">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-mr-2.5 ml-auto h-8 gap-1 px-2.5 font-medium text-foreground"
              onClick={() => toggleSort("metric")}
            >
              {metricLabel}
              <SortIcon sorted={sortKey === "metric" ? sortDir : false} />
            </Button>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((member) => {
          const value = metricValue(member, memberMetric);
          return (
            <TableRow key={member.userId}>
              <TableCell>
                <div className="min-w-0">
                  <div className="truncate font-medium">{memberLabel(member)}</div>
                  {member.username ? (
                    <div className="truncate font-mono text-xs text-muted-foreground">
                      {member.userId}
                    </div>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{member.role ?? "—"}</TableCell>
              <TableCell className="text-right font-mono">
                {value != null ? formatDisplayNumber(value, 0) : "—"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
