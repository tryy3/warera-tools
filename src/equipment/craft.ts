import type { GearTierId } from "../calculator";
import type { ItemMarketTxRow } from "../db/item-market-tx-read";
import { compareEquipmentItems, ITEM_CODE_TIER_OVERRIDES } from "./catalog";
import { median } from "./median";

export type CraftCost = {
  scrapQty: number;
  steelRandom: number;
  steelSpecific: number;
};

export const CRAFT_COSTS: Record<GearTierId, CraftCost> = {
  red: { scrapQty: 1460, steelRandom: 32, steelSpecific: 64 },
  yellow: { scrapQty: 486, steelRandom: 16, steelSpecific: 32 },
  purple: { scrapQty: 162, steelRandom: 8, steelSpecific: 16 },
  blue: { scrapQty: 54, steelRandom: 4, steelSpecific: 8 },
  green: { scrapQty: 18, steelRandom: 2, steelSpecific: 4 },
  gray: { scrapQty: 6, steelRandom: 1, steelSpecific: 2 },
};

const TIER_DIGIT: Record<GearTierId, number> = {
  gray: 1,
  green: 2,
  blue: 3,
  purple: 4,
  yellow: 5,
  red: 6,
};

const ARMOR_BASES = ["helmet", "chest", "gloves", "pants", "boots"] as const;

export function craftCostForTier(tier: GearTierId): CraftCost {
  return CRAFT_COSTS[tier];
}

export function itemCodesForTier(tier: GearTierId): string[] {
  const digit = TIER_DIGIT[tier];
  const weapon = Object.entries(ITEM_CODE_TIER_OVERRIDES).find(([, t]) => t === tier)?.[0] ?? null;
  const codes: string[] = [];
  if (weapon) codes.push(weapon);
  for (const base of ARMOR_BASES) codes.push(`${base}${digit}`);
  return codes.sort(compareEquipmentItems);
}

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

export type CraftCompareResult = {
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

function exclFromMoney(money: number, taxRate: number): number {
  return money / (1 + taxRate);
}

function advantage(
  gearExcl: number | null,
  steelCost: number | null,
  scrapValue: number | null,
): number | null {
  if (gearExcl == null || steelCost == null || scrapValue == null) return null;
  return gearExcl - steelCost - scrapValue;
}

function minMax(values: number[]): { min: number | null; max: number | null } {
  if (values.length === 0) return { min: null, max: null };
  let min = values[0]!;
  let max = values[0]!;
  for (let i = 1; i < values.length; i++) {
    const v = values[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

function emptyStats(trades = 0): CraftStatBlock {
  return {
    minExcl: null,
    medianExcl: null,
    maxExcl: null,
    minAdvantage: null,
    medianAdvantage: null,
    maxAdvantage: null,
    trades,
  };
}

function statsFromExcls(
  exclPrices: number[],
  steelCost: number | null,
  scrapValue: number | null,
): CraftStatBlock {
  if (exclPrices.length === 0) return emptyStats(0);
  const { min, max } = minMax(exclPrices);
  const med = median(exclPrices);
  return {
    minExcl: min,
    medianExcl: med,
    maxExcl: max,
    minAdvantage: advantage(min, steelCost, scrapValue),
    medianAdvantage: advantage(med, steelCost, scrapValue),
    maxAdvantage: advantage(max, steelCost, scrapValue),
    trades: exclPrices.length,
  };
}

export function buildCraftCompare(input: {
  tier: GearTierId;
  txs: ItemMarketTxRow[];
  scrapPrice: number | null;
  steelPrice: number | null;
  taxRate: number;
}): CraftCompareResult {
  const { tier, txs, scrapPrice, steelPrice, taxRate } = input;
  const cost = craftCostForTier(tier);
  const codes = itemCodesForTier(tier);
  const scrapValue =
    scrapPrice != null && Number.isFinite(scrapPrice) ? cost.scrapQty * scrapPrice : null;
  const steelCostRandom =
    steelPrice != null && Number.isFinite(steelPrice) ? cost.steelRandom * steelPrice : null;
  const steelCostSpecific =
    steelPrice != null && Number.isFinite(steelPrice) ? cost.steelSpecific * steelPrice : null;

  const byCode = new Map<string, number[]>();
  for (const code of codes) byCode.set(code, []);
  for (const row of txs) {
    const list = byCode.get(row.itemCode);
    if (!list) continue;
    list.push(exclFromMoney(row.money, taxRate));
  }

  const specific: CraftSpecificRow[] = codes.map((itemCode) => {
    const exclPrices = byCode.get(itemCode) ?? [];
    return {
      itemCode,
      ...statsFromExcls(exclPrices, steelCostSpecific, scrapValue),
    };
  });

  specific.sort((a, b) => {
    if (a.medianAdvantage == null && b.medianAdvantage == null) {
      return compareEquipmentItems(a.itemCode, b.itemCode);
    }
    if (a.medianAdvantage == null) return 1;
    if (b.medianAdvantage == null) return -1;
    if (b.medianAdvantage !== a.medianAdvantage) {
      return b.medianAdvantage - a.medianAdvantage;
    }
    return compareEquipmentItems(a.itemCode, b.itemCode);
  });

  const priced = specific.filter((r) => r.trades > 0);
  const allExcls: number[] = [];
  const medians: number[] = [];
  let randomTrades = 0;
  for (const row of priced) {
    const exclPrices = byCode.get(row.itemCode) ?? [];
    allExcls.push(...exclPrices);
    if (row.medianExcl != null) medians.push(row.medianExcl);
    randomTrades += row.trades;
  }

  let random: CraftStatBlock;
  if (priced.length === 0) {
    random = emptyStats(0);
  } else {
    const { min, max } = minMax(allExcls);
    const typical =
      medians.length === 0 ? null : medians.reduce((s, v) => s + v, 0) / medians.length;
    random = {
      minExcl: min,
      medianExcl: typical,
      maxExcl: max,
      minAdvantage: advantage(min, steelCostRandom, scrapValue),
      medianAdvantage: advantage(typical, steelCostRandom, scrapValue),
      maxAdvantage: advantage(max, steelCostRandom, scrapValue),
      trades: randomTrades,
    };
  }

  return {
    tier,
    scrapQty: cost.scrapQty,
    steelRandom: cost.steelRandom,
    steelSpecific: cost.steelSpecific,
    scrapPrice,
    steelPrice,
    scrapValue,
    steelCostRandom,
    steelCostSpecific,
    taxRate,
    itemCount: codes.length,
    pricedItemCount: priced.length,
    random,
    specific,
  };
}
