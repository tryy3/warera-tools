export type PeakAtkCandidate = {
  atk: number;
  recordedAt: Date;
  id?: number;
};

export function pickHighestAtkSnapshot<T extends PeakAtkCandidate>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, row) => {
    if (row.atk > best.atk) return row;
    if (row.atk < best.atk) return best;
    const timeDiff = row.recordedAt.getTime() - best.recordedAt.getTime();
    if (timeDiff > 0) return row;
    if (timeDiff < 0) return best;
    return (row.id ?? 0) >= (best.id ?? 0) ? row : best;
  });
}
