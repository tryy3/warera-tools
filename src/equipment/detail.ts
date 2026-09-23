import type { GearTierId } from "../calculator";
import { scrapAmountForTier } from "../calculator";
import { txMoney, type ItemMarketTxRow } from "../db/item-market-tx-read";
import { isFiniteMoney, parseMoney, type Decimal } from "../money/decimal";
import { tierFromItemCode } from "./catalog";
import { listingPrice, priceBounds } from "./listing-price";
import { median } from "./median";
import { recommendListing, type RecommendListing } from "./recommend";
import {
  lowestObservedSkills,
  matchesSkillBands,
  parseSkillNumbers,
  type SkillBand,
  type SkillNumbers,
} from "./skills";
import { MARKET_WINDOW_MS, RECENT_SALES_LIMIT } from "./windows";

export type EquipmentDetail = {
  itemCode: string;
  tier: GearTierId | null;
  scrapPrice: Decimal | null;
  taxRate: number | null;
  countryId: string | null;
  lowestObserved: SkillNumbers | null;
  skillKeys: string[];
  activeBands: SkillBand[];
  /** Raw 24h median, including one-off cheap fills and overpays. */
  marketMedian: Decimal | null;
  marketLow: Decimal | null;
  marketHigh: Decimal | null;
  /**
   * Price to list near: 24h sales with isolated lows/highs removed.
   * Falls back to the last {@link RECENT_SALES_LIMIT} sales when the last 24h is empty.
   */
  marketTypical: Decimal | null;
  /** `24h` when the typical price uses the market window; `recent` when it falls back. */
  listingWindow: "24h" | "recent" | null;
  sellerNet: Decimal | null;
  scrapFloor: Decimal | null;
  recommend: RecommendListing | null;
  trades: number;
  recentSales: { money: Decimal; createdAtMs: number }[];
  dailyMedians: { day: string; median: Decimal; trades: number }[];
  ladder: { bucketLabel: string; median: Decimal; trades: number }[];
};

export type BuildEquipmentDetailInput = {
  itemCode: string;
  txs: ItemMarketTxRow[];
  scrapPrice: Decimal | number | null;
  taxRate: number | null;
  countryId: string | null;
  skills: SkillBand[] | null;
  now: number;
};

type ParsedTx = {
  money: Decimal;
  createdAtMs: number;
  skills: SkillNumbers;
};

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function bandsFromLowest(lowest: SkillNumbers | null): SkillBand[] {
  if (!lowest) return [];
  return Object.keys(lowest)
    .toSorted()
    .map((key) => ({ key, target: lowest[key]!, band: 0 }));
}

function buildDailyMedians(matched: ParsedTx[]): EquipmentDetail["dailyMedians"] {
  const byDay = new Map<string, Decimal[]>();
  for (const row of matched) {
    const day = utcDay(row.createdAtMs);
    const list = byDay.get(day);
    if (list) list.push(row.money);
    else byDay.set(day, [row.money]);
  }
  return [...byDay.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([day, moneys]) => ({
      day,
      median: median(moneys)!,
      trades: moneys.length,
    }));
}

function buildLadder(
  parsed: ParsedTx[],
  skillKeys: string[],
  activeBands: SkillBand[],
): EquipmentDetail["ladder"] {
  const ladderKey = skillKeys[0];
  if (!ladderKey) return [];

  const otherBands = activeBands.filter((b) => b.key !== ladderKey);
  const eligible = parsed.filter((row) => matchesSkillBands(row.skills, otherBands));
  if (eligible.length === 0) return [];

  const byBucket = new Map<number, Decimal[]>();
  for (const row of eligible) {
    const raw = row.skills[ladderKey];
    if (raw === undefined) continue;
    const bucket = Math.round(raw);
    const list = byBucket.get(bucket);
    if (list) list.push(row.money);
    else byBucket.set(bucket, [row.money]);
  }

  return [...byBucket.entries()]
    .toSorted(([a], [b]) => a - b)
    .map(([bucket, moneys]) => ({
      bucketLabel: String(bucket),
      median: median(moneys)!,
      trades: moneys.length,
    }));
}

export function buildEquipmentDetail(input: BuildEquipmentDetailInput): EquipmentDetail {
  const { itemCode, txs, taxRate, countryId, skills, now } = input;
  const scrapPrice = parseMoney(input.scrapPrice);
  const tier = tierFromItemCode(itemCode);

  const parsed: ParsedTx[] = [];
  const skillRows: SkillNumbers[] = [];
  for (const tx of txs) {
    const skillsNum = parseSkillNumbers(tx.skills);
    if (!skillsNum) continue;
    skillRows.push(skillsNum);
    parsed.push({
      money: txMoney(tx),
      createdAtMs: tx.createdAt.getTime(),
      skills: skillsNum,
    });
  }

  const lowestObserved = lowestObservedSkills(skillRows);
  const skillKeys = lowestObserved ? Object.keys(lowestObserved).toSorted() : [];
  const activeBands =
    skills != null && skills.length > 0 ? skills : bandsFromLowest(lowestObserved);

  const bandMatched = parsed.filter((row) => matchesSkillBands(row.skills, activeBands));
  const marketSince = now - MARKET_WINDOW_MS;
  const marketMatched = bandMatched.filter((row) => row.createdAtMs >= marketSince);
  const windowMoneys = marketMatched.map((r) => r.money);
  const marketMedian = median(windowMoneys);
  const { low: marketLow, high: marketHigh } = priceBounds(windowMoneys);
  const trades = marketMatched.length;

  const recentSales = [...bandMatched]
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, RECENT_SALES_LIMIT)
    .map((row) => ({ money: row.money, createdAtMs: row.createdAtMs }));

  const listingWindow = windowMoneys.length > 0 ? "24h" : recentSales.length > 0 ? "recent" : null;
  const marketTypical = listingPrice(
    listingWindow === "24h" ? windowMoneys : recentSales.map((row) => row.money),
  );

  const sellerNet =
    marketTypical != null && taxRate != null ? marketTypical.div(1 + taxRate) : null;

  const scrapFloor =
    tier != null && isFiniteMoney(scrapPrice) ? scrapPrice.times(scrapAmountForTier(tier)) : null;

  const recommend =
    tier != null && isFiniteMoney(scrapPrice) && taxRate != null
      ? recommendListing({ tier, scrapPrice, taxRate })
      : null;

  return {
    itemCode,
    tier,
    scrapPrice,
    taxRate,
    countryId,
    lowestObserved,
    skillKeys,
    activeBands,
    marketMedian,
    marketLow,
    marketHigh,
    marketTypical,
    listingWindow,
    sellerNet,
    scrapFloor,
    recommend,
    trades,
    recentSales,
    dailyMedians: buildDailyMedians(bandMatched),
    ladder: buildLadder(parsed, skillKeys, activeBands),
  };
}
