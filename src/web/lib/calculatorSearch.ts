import { GEAR_TIERS, type GearTierId } from "@/calculator";

export type CalculatorSearch = {
  tier?: GearTierId;
  country?: string;
  price?: string;
};

export const DEFAULT_CALC_TIER: GearTierId = "green";

const TIER_IDS = new Set<string>(GEAR_TIERS.map((t) => t.id));

function isGearTierId(value: string): value is GearTierId {
  return TIER_IDS.has(value);
}

export function parseCalculatorSearch(search: Record<string, unknown>): CalculatorSearch {
  const out: CalculatorSearch = {};

  if (typeof search.tier === "string" && isGearTierId(search.tier)) {
    out.tier = search.tier;
  }

  if (typeof search.country === "string") {
    const country = search.country.trim();
    if (country) out.country = country;
  }

  if (typeof search.price === "string") {
    const price = search.price.trim();
    if (price !== "" && Number.isFinite(Number(price))) {
      out.price = price;
    }
  }

  return out;
}

export function buildCalculatorSearch(input: {
  tier: GearTierId;
  countryId: string;
  inclPrice: string;
  defaultCountryId: string;
}): CalculatorSearch {
  const out: CalculatorSearch = {};
  if (input.tier !== DEFAULT_CALC_TIER) out.tier = input.tier;
  if (input.countryId && input.countryId !== input.defaultCountryId) {
    out.country = input.countryId;
  }
  const price = input.inclPrice.trim();
  if (price !== "" && Number.isFinite(Number(price))) out.price = price;
  return out;
}
