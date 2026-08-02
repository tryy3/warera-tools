import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import type { GrowthPlanResult } from "./types";

/** Prefer days for path timing; keep short waits readable. */
export function formatPlanDuration(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours)) return "—";
  if (hours <= 0) return "now";
  const days = hours / 24;
  if (days < 1) {
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
    return `${formatDisplayNumber(hours, 1)}h`;
  }
  // Always one decimal so e.g. 12.0d vs 12.4d is visible.
  return `${formatDisplayNumber(days, 1)}d`;
}

export function formatPlanStatus(result: GrowthPlanResult): {
  label: string;
  tone: "ok" | "warn" | "bad" | "muted";
} {
  if (result.complete && result.timeToGoalHours != null) {
    if (result.timeToGoalHours <= 0) return { label: "done", tone: "ok" };
    return { label: formatPlanDuration(result.timeToGoalHours), tone: "ok" };
  }
  if (result.stuck) return { label: "stuck", tone: "bad" };
  if (result.hitIterLimit) return { label: "incomplete", tone: "warn" };
  return { label: "—", tone: "muted" };
}

export function formatGold(value: number, digits = 2): string {
  return formatDisplayNumber(value, digits);
}

export function formatSignedGold(value: number, digits = 2): string {
  const body = formatGold(Math.abs(value), digits);
  if (value > 0) return `+${body}`;
  if (value < 0) return `−${body}`;
  return body;
}
