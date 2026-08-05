export type SkillNumbers = Record<string, number>;

export function parseSkillNumbers(
  skills: Record<string, unknown> | null | undefined,
): SkillNumbers | null {
  if (!skills) return null;
  const out: SkillNumbers = {};
  for (const [k, v] of Object.entries(skills)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export type SkillBand = { key: string; target: number; band: number };

export function matchesSkillBands(skills: SkillNumbers, bands: SkillBand[]): boolean {
  if (bands.length === 0) return true;
  for (const b of bands) {
    const v = skills[b.key];
    if (v === undefined) return false;
    const band = Math.max(0, b.band);
    if (v < b.target - band || v > b.target + band) return false;
  }
  return true;
}

export function lowestObservedSkills(rows: SkillNumbers[]): SkillNumbers | null {
  if (rows.length === 0) return null;
  const out: SkillNumbers = {};
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      const cur = out[k];
      out[k] = cur === undefined ? v : Math.min(cur, v);
    }
  }
  return out;
}
