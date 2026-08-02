export const CONCRETE_PER_COMPANY_INDEX = 50;
export const MAX_AE_LEVEL = 7;
export const MAX_COMPANIES = 12;

/** Concrete units to buy company `#nextCompanyIndex` (1-based). */
export function concreteForNewCompany(nextCompanyIndex: number): number {
  if (!Number.isInteger(nextCompanyIndex) || nextCompanyIndex < 1) {
    throw new Error("nextCompanyIndex must be an integer >= 1");
  }
  return nextCompanyIndex * CONCRETE_PER_COMPANY_INDEX;
}

/** Steel units to upgrade AE from `fromLevel` to `fromLevel + 1`. */
export function steelForAeUpgrade(fromLevel: number): number {
  if (!Number.isInteger(fromLevel) || fromLevel < 1 || fromLevel >= MAX_AE_LEVEL) {
    throw new Error("fromLevel must be an integer in 1..6");
  }
  return 20 * 2 ** (fromLevel - 1);
}
