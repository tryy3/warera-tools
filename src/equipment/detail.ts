import type { GearTierId } from "../calculator";
import { scrapAmountForTier } from "../calculator";
import type { ItemMarketTxRow } from "../db/item-market-tx-read";
import { tierFromItemCode } from "./catalog";
import { median } from "./median";
import { recommendListing, type RecommendListing } from "./recommend";
import {
  lowestObservedSkills,
  matchesSkillBands,
  parseSkillNumbers,
  type SkillBand,
  type SkillNumbers,
} from "./skills";
import { MARKET_WINDOW_MS } from "./windows";

export type EquipmentDetail = {
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
  recommend: RecommendListing | null;
  trades: number;
  dailyMedians: { day: string; median: number; trades: number }[];
  ladder: { bucketLabel: string; median: number; trades: number }[];
};

export type BuildEquipmentDetailInput = {
  itemCode: string;
  txs: ItemMarketTxRow[];
  scrapPrice: number | null;
  taxRate: number | null;
  countryId: string | null;
  skills: SkillBand[] | null;
  now: number;
};

type ParsedTx = {
  money: number;
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
    .map((key) => ({ key, target: lowest[key]!, band: 1 }));
}

function buildDailyMedians(matched: ParsedTx[]): EquipmentDetail["dailyMedians"] {
  const byDay = new Map<string, number[]>();
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

  const byBucket = new Map<number, number[]>();
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
  const { itemCode, txs, scrapPrice, taxRate, countryId, skills, now } = input;
  const tier = tierFromItemCode(itemCode);

  const parsed: ParsedTx[] = [];
  const skillRows: SkillNumbers[] = [];
  for (const tx of txs) {
    const skillsNum = parseSkillNumbers(tx.skills);
    if (!skillsNum) continue;
    skillRows.push(skillsNum);
    parsed.push({
      money: tx.money,
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
  const marketMedian = median(marketMatched.map((r) => r.money));
  const trades = marketMatched.length;

  const sellerNet =
    marketMedian != null && taxRate != null ? marketMedian / (1 + taxRate) : null;

  const scrapFloor =
    tier != null && scrapPrice != null ? scrapAmountForTier(tier) * scrapPrice : null;

  const recommend =
    tier != null && scrapPrice != null && taxRate != null
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
    sellerNet,
    scrapFloor,
    recommend,
    trades,
    dailyMedians: buildDailyMedians(bandMatched),
    ladder: buildLadder(parsed, skillKeys, activeBands),
  };
}
