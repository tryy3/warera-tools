import type { GearTierId } from "../calculator";
import { txMoney, type ItemMarketTxRow } from "../db/item-market-tx-read";
import { Decimal, isFiniteMoney, parseMoney } from "../money/decimal";
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
  minExcl: Decimal | null;
  medianExcl: Decimal | null;
  maxExcl: Decimal | null;
  minAdvantage: Decimal | null;
  medianAdvantage: Decimal | null;
  maxAdvantage: Decimal | null;
  trades: number;
};

export type CraftSpecificRow = CraftStatBlock & { itemCode: string };

export type CraftCompareResult = {
  tier: GearTierId;
  scrapQty: number;
  steelRandom: number;
  steelSpecific: number;
  scrapPrice: Decimal | null;
  steelPrice: Decimal | null;
  scrapValue: Decimal | null;
  steelCostRandom: Decimal | null;
  steelCostSpecific: Decimal | null;
  taxRate: number;
  itemCount: number;
  pricedItemCount: number;
  random: CraftStatBlock;
  specific: CraftSpecificRow[];
};

function exclFromMoney(money: Decimal, taxRate: number): Decimal {
  return money.div(1 + taxRate);
}

function advantage(
  gearExcl: Decimal | null,
  steelCost: Decimal | null,
  scrapValue: Decimal | null,
): Decimal | null {
  if (gearExcl == null || steelCost == null || scrapValue == null) return null;
  return gearExcl.minus(steelCost).minus(scrapValue);
}

function minMax(values: Decimal[]): { min: Decimal | null; max: Decimal | null } {
  if (values.length === 0) return { min: null, max: null };
  let min = values[0]!;
  let max = values[0]!;
  for (let i = 1; i < values.length; i++) {
    const v = values[i]!;
    if (v.lt(min)) min = v;
    if (v.gt(max)) max = v;
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
  exclPrices: Decimal[],
  steelCost: Decimal | null,
  scrapValue: Decimal | null,
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
  scrapPrice: Decimal | number | null;
  steelPrice: Decimal | number | null;
  taxRate: number;
}): CraftCompareResult {
  const { tier, txs, taxRate } = input;
  const scrapPrice = parseMoney(input.scrapPrice);
  const steelPrice = parseMoney(input.steelPrice);
  const cost = craftCostForTier(tier);
  const codes = itemCodesForTier(tier);
  const scrapValue = isFiniteMoney(scrapPrice) ? scrapPrice.times(cost.scrapQty) : null;
  const steelCostRandom = isFiniteMoney(steelPrice) ? steelPrice.times(cost.steelRandom) : null;
  const steelCostSpecific = isFiniteMoney(steelPrice) ? steelPrice.times(cost.steelSpecific) : null;

  const byCode = new Map<string, Decimal[]>();
  for (const code of codes) byCode.set(code, []);
  for (const row of txs) {
    const list = byCode.get(row.itemCode);
    if (!list) continue;
    list.push(exclFromMoney(txMoney(row), taxRate));
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
    const cmp = b.medianAdvantage.comparedTo(a.medianAdvantage);
    if (cmp !== 0) return cmp;
    return compareEquipmentItems(a.itemCode, b.itemCode);
  });

  const priced = specific.filter((r) => r.trades > 0);
  const allExcls: Decimal[] = [];
  const medians: Decimal[] = [];
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
      medians.length === 0
        ? null
        : medians.reduce((s, v) => s.plus(v), new Decimal(0)).div(medians.length);
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
