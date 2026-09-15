export const FIGHT_DESK_PREFS_VERSION = 1;

export type FightDeskPrefsV1 = {
  v: 1;
  foodId: string;
  battleBonus: number;
  ticks: number;
  selectedUserIds: string[];
  lastPresetId: string | null;
  expandedUserIds: string[];
};

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function parsePrefs(raw: string | null): FightDeskPrefsV1 | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== "object") return null;
    const row = parsed as Record<string, unknown>;
    if (row.v !== FIGHT_DESK_PREFS_VERSION) return null;
    if (typeof row.foodId !== "string") return null;
    if (typeof row.battleBonus !== "number" || !Number.isFinite(row.battleBonus)) return null;
    if (typeof row.ticks !== "number" || !Number.isFinite(row.ticks)) return null;
    const lastPresetId = row.lastPresetId;
    if (lastPresetId != null && typeof lastPresetId !== "string") return null;
    return {
      v: 1,
      foodId: row.foodId,
      battleBonus: row.battleBonus,
      ticks: row.ticks,
      selectedUserIds: parseStringArray(row.selectedUserIds),
      lastPresetId: lastPresetId ?? null,
      expandedUserIds: parseStringArray(row.expandedUserIds),
    };
  } catch {
    return null;
  }
}

export function fightDeskPrefsKey(muId: string): string {
  return `fightDeskPrefs:v1:${muId}`;
}

export function defaultFightDeskPrefs(): FightDeskPrefsV1 {
  return {
    v: FIGHT_DESK_PREFS_VERSION,
    foodId: "steak",
    battleBonus: 0,
    ticks: 0,
    selectedUserIds: [],
    lastPresetId: null,
    expandedUserIds: [],
  };
}

export function loadFightDeskPrefs(muId: string): FightDeskPrefsV1 | null {
  try {
    return parsePrefs(localStorage.getItem(fightDeskPrefsKey(muId)));
  } catch {
    return null;
  }
}

export function saveFightDeskPrefs(muId: string, prefs: FightDeskPrefsV1): void {
  try {
    localStorage.setItem(fightDeskPrefsKey(muId), JSON.stringify(prefs));
  } catch {
    // fail soft
  }
}
