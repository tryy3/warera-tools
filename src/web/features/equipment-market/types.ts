import type { GearTierId } from "@/calculator";
import type { SkillBand, SkillNumbers } from "@/equipment/skills";

/** Wire money fields are JSON strings (Decimal.toJSON / serializeMoney). */
export type OverviewItem = {
  itemCode: string;
  tier: GearTierId | null;
  marketMedian: string | null;
  scrapFloor: string | null;
  spread: string | null;
  trades: number;
};

export type OverviewResponse = {
  windowMs: number;
  scrapPrice: string | null;
  scrapedAt: string | null;
  items: OverviewItem[];
};

export type CraftStatBlock = {
  minExcl: string | null;
  medianExcl: string | null;
  maxExcl: string | null;
  minAdvantage: string | null;
  medianAdvantage: string | null;
  maxAdvantage: string | null;
  trades: number;
};

export type CraftSpecificRow = CraftStatBlock & { itemCode: string };

export type CraftCompareResponse = {
  windowMs: number;
  scrapedAt: string | null;
  steelFetchedAt: string | null;
  tier: GearTierId;
  scrapQty: number;
  steelRandom: number;
  steelSpecific: number;
  scrapPrice: string | null;
  steelPrice: string | null;
  scrapValue: string | null;
  steelCostRandom: string | null;
  steelCostSpecific: string | null;
  taxRate: number;
  itemCount: number;
  pricedItemCount: number;
  random: CraftStatBlock;
  specific: CraftSpecificRow[];
};

export type RecommendListingDto = {
  scrapFloor: string;
  breakEvenIncl: string;
  attractiveIncl: string;
};

export type DetailResponse = {
  itemCode: string;
  tier: GearTierId | null;
  scrapPrice: string | null;
  taxRate: number | null;
  countryId: string | null;
  lowestObserved: SkillNumbers | null;
  skillKeys: string[];
  activeBands: SkillBand[];
  marketMedian: string | null;
  marketLow: string | null;
  marketHigh: string | null;
  marketTypical: string | null;
  listingWindow: "24h" | "recent" | null;
  sellerNet: string | null;
  scrapFloor: string | null;
  recommend: RecommendListingDto | null;
  trades: number;
  recentSales: { money: string; createdAt: string }[];
  dailyMedians: { day: string; median: string; trades: number }[];
  ladder: { bucketLabel: string; median: string; trades: number }[];
};

export type { Country, CountriesResponse } from "../calculator/types";
