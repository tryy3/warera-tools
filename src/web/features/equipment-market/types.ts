import type { GearTierId } from "@/calculator";

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

export type { Country, CountriesResponse } from "../calculator/types";
