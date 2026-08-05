export const EQUIPMENT_PREFS_KEY = "equipmentPrefs:v1";

type EquipmentPrefs = {
  countryId: string;
};

function parsePrefs(raw: string | null): EquipmentPrefs | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== "object") return null;
    const countryId = (parsed as Record<string, unknown>).countryId;
    if (typeof countryId !== "string") return null;
    return { countryId };
  } catch {
    return null;
  }
}

export function loadEquipmentCountryId(): string | null {
  try {
    return parsePrefs(localStorage.getItem(EQUIPMENT_PREFS_KEY))?.countryId ?? null;
  } catch {
    return null;
  }
}

export function saveEquipmentCountryId(countryId: string): void {
  try {
    localStorage.setItem(
      EQUIPMENT_PREFS_KEY,
      JSON.stringify({ countryId } satisfies EquipmentPrefs),
    );
  } catch {
    // fail soft
  }
}
