import type { SkillBand, SkillNumbers } from "@/equipment/skills";

export type StoredEquipmentStats = {
  targets: Record<string, number>;
  bands: Record<string, number>;
};

export function equipmentStatsKey(itemCode: string): string {
  return `equipmentStats:v1:${itemCode}`;
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(
    (v) => typeof v === "number" && Number.isFinite(v),
  );
}

function parseStoredStats(raw: string | null): StoredEquipmentStats | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== "object") return null;
    const row = parsed as Record<string, unknown>;
    if (!isNumberRecord(row.targets) || !isNumberRecord(row.bands)) return null;
    return { targets: row.targets, bands: row.bands };
  } catch {
    return null;
  }
}

export function loadStoredEquipmentStats(itemCode: string): StoredEquipmentStats | null {
  try {
    return parseStoredStats(localStorage.getItem(equipmentStatsKey(itemCode)));
  } catch {
    return null;
  }
}

export function saveStoredEquipmentStats(itemCode: string, stats: StoredEquipmentStats): void {
  try {
    localStorage.setItem(equipmentStatsKey(itemCode), JSON.stringify(stats));
  } catch {
    // fail soft
  }
}

export function loadStats(itemCode: string, lowestObserved: SkillNumbers | null): SkillBand[] {
  const stored = loadStoredEquipmentStats(itemCode);
  if (stored && Object.keys(stored.targets).length > 0) {
    return Object.keys(stored.targets).map((key) => ({
      key,
      target: stored.targets[key]!,
      band: stored.bands[key] ?? 1,
    }));
  }
  if (!lowestObserved) return [];
  return Object.entries(lowestObserved).map(([key, target]) => ({
    key,
    target,
    band: 1,
  }));
}
