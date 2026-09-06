import type { GearTierId } from "@/calculator";
import type { SkillBand, SkillNumbers } from "@/equipment/skills";

export type OverviewItem = {
  itemCode: string;
  tier: GearTierId | null;
  marketMedian: number | null;
  scrapFloor: number | null;
  spread: number | null;
  trades: number;
};

export type OverviewResponse = {
  windowMs: number;
  scrapPrice: number | null;
  scrapedAt: string | null;
  items: OverviewItem[];
};

export type CraftStatBlock = {
  minExcl: number | null;
  medianExcl: number | null;
  maxExcl: number | null;
  minAdvantage: number | null;
  medianAdvantage: number | null;
  maxAdvantage: number | null;
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
  scrapPrice: number | null;
  steelPrice: number | null;
  scrapValue: number | null;
  steelCostRandom: number | null;
  steelCostSpecific: number | null;
  taxRate: number;
  itemCount: number;
  pricedItemCount: number;
  random: CraftStatBlock;
  specific: CraftSpecificRow[];
};

export type RecommendListingDto = {
  scrapFloor: number;
  breakEvenIncl: number;
  attractiveIncl: number;
};

export type DetailResponse = {
  itemCode: string;
  tier: GearTierId | null;
  scrapPrice: number | null;
  taxRate: number | null;
  countryId: string | null;
  lowestObserved: SkillNumbers | null;
  skillKeys: string[];
  activeBands: SkillBand[];
  marketMedian: number | null;
  sellerNet: number | null;
  scrapFloor: number | null;
  recommend: RecommendListingDto | null;
  trades: number;
  dailyMedians: { day: string; median: number; trades: number }[];
  ladder: { bucketLabel: string; median: number; trades: number }[];
};

export type { Country, CountriesResponse } from "../calculator/types";
