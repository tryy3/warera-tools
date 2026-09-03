export const MU_HISTORY_RANGES = ["24h", "7d", "30d", "all", "this_week", "last_week"] as const;
export type MuHistoryRange = (typeof MU_HISTORY_RANGES)[number];

const ROLLING_MS: Record<"24h" | "7d" | "30d", number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function parseMuHistoryRange(value: unknown): MuHistoryRange {
  if (typeof value === "string" && (MU_HISTORY_RANGES as readonly string[]).includes(value)) {
    return value as MuHistoryRange;
  }
  return "7d";
}

/** Monday 00:00:00.000 UTC containing or starting the week of `d`. */
export function startOfUtcWeek(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

export function resolveMuHistoryWindow(
  range: MuHistoryRange,
  now: Date = new Date(),
): { from: Date | null; to: Date } {
  if (range === "all") return { from: null, to: now };
  if (range === "this_week") return { from: startOfUtcWeek(now), to: now };
  if (range === "last_week") {
    const thisMon = startOfUtcWeek(now);
    const lastMon = new Date(thisMon);
    lastMon.setUTCDate(lastMon.getUTCDate() - 7);
    return { from: lastMon, to: thisMon };
  }
  return { from: new Date(now.getTime() - ROLLING_MS[range]), to: now };
}
