export const FIGHT_DESK_PREFS_VERSION = 2;

export type FightDeskPrefsV2 = {
  v: 2;
  foodId: string;
  battleBonus: number;
  ticks: number;
  selectedUserIds: string[];
  lastPresetId: string | null;
  expandedUserIds: string[];
  selectedBattleId: string | "custom";
};

/** @deprecated Use `FightDeskPrefsV2` or `FightDeskPrefs`. */
export type FightDeskPrefsV1 = FightDeskPrefsV2;

export type FightDeskPrefs = FightDeskPrefsV2;

function fightDeskPrefsV1Key(muId: string): string {
  return `fightDeskPrefs:v1:${muId}`;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function parseSelectedBattleId(value: unknown): string | "custom" | null {
  if (value === "custom") return "custom";
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function parseCommonFields(
  row: Record<string, unknown>,
): Omit<FightDeskPrefsV2, "v" | "selectedBattleId"> | null {
  if (typeof row.foodId !== "string") return null;
  if (typeof row.battleBonus !== "number" || !Number.isFinite(row.battleBonus)) return null;
  if (typeof row.ticks !== "number" || !Number.isFinite(row.ticks)) return null;
  const lastPresetId = row.lastPresetId;
  if (lastPresetId != null && typeof lastPresetId !== "string") return null;
  return {
    foodId: row.foodId,
    battleBonus: row.battleBonus,
    ticks: row.ticks,
    selectedUserIds: parseStringArray(row.selectedUserIds),
    lastPresetId: lastPresetId ?? null,
    expandedUserIds: parseStringArray(row.expandedUserIds),
  };
}

function parsePrefs(raw: string | null): FightDeskPrefsV2 | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== "object") return null;
    const row = parsed as Record<string, unknown>;

    if (row.v === 1) {
      const common = parseCommonFields(row);
      if (!common) return null;
      return { v: 2, ...common, selectedBattleId: "custom" };
    }

    if (row.v !== FIGHT_DESK_PREFS_VERSION) return null;
    const common = parseCommonFields(row);
    if (!common) return null;
    const selectedBattleId = parseSelectedBattleId(row.selectedBattleId);
    if (selectedBattleId == null) return null;
    return { v: 2, ...common, selectedBattleId };
  } catch {
    return null;
  }
}

export function fightDeskPrefsKey(muId: string): string {
  return `fightDeskPrefs:v2:${muId}`;
}

export function defaultFightDeskPrefs(): FightDeskPrefsV2 {
  return {
    v: FIGHT_DESK_PREFS_VERSION,
    foodId: "steak",
    battleBonus: 0,
    ticks: 0,
    selectedUserIds: [],
    lastPresetId: null,
    expandedUserIds: [],
    selectedBattleId: "custom",
  };
}

export function loadFightDeskPrefs(muId: string): FightDeskPrefsV2 | null {
  try {
    const fromV2 = parsePrefs(localStorage.getItem(fightDeskPrefsKey(muId)));
    if (fromV2) return fromV2;
    return parsePrefs(localStorage.getItem(fightDeskPrefsV1Key(muId)));
  } catch {
    return null;
  }
}

export function saveFightDeskPrefs(muId: string, prefs: FightDeskPrefsV2): void {
  try {
    localStorage.setItem(fightDeskPrefsKey(muId), JSON.stringify(prefs));
  } catch {
    // fail soft
  }
}
