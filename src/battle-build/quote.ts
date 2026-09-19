import { median as calculateMedian } from "../equipment/median";
import { matchesSkillBands, parseSkillNumbers, type SkillBand } from "../equipment/skills";
import { parseMoney, type Decimal } from "../money/decimal";

export type QuoteWindow = "24h" | "last10" | "thin";

export type QuoteLineInput = {
  id: string;
  itemCode: string;
  skills: Record<string, number> | null;
};

export type QuoteLineResult = {
  id: string;
  median: Decimal | null;
  trades: number;
  window: QuoteWindow;
  widened: boolean;
};

export type QuoteTx = {
  money: Decimal | number;
  createdAtMs: number;
  skills: Record<string, number>;
};

export const QUOTE_MIN_TRADES = 10;
export const QUOTE_24H_MS = 24 * 60 * 60 * 1000;

type ItemQuote = Omit<QuoteLineResult, "id">;
type SufficientQuote = Omit<ItemQuote, "widened">;

function moneyValues(txs: QuoteTx[]): Decimal[] {
  return txs.map((transaction) => parseMoney(transaction.money)!);
}

function quoteSufficientMatches(matches: QuoteTx[], nowMs: number): SufficientQuote | null {
  const recent = matches.filter((transaction) => transaction.createdAtMs >= nowMs - QUOTE_24H_MS);
  if (recent.length >= QUOTE_MIN_TRADES) {
    return {
      median: calculateMedian(moneyValues(recent)),
      trades: recent.length,
      window: "24h",
    };
  }

  if (matches.length >= QUOTE_MIN_TRADES) {
    const newest = matches
      .toSorted((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, QUOTE_MIN_TRADES);
    return {
      median: calculateMedian(moneyValues(newest)),
      trades: newest.length,
      window: "last10",
    };
  }

  return null;
}

function matchingTransactions(txs: QuoteTx[], bands: SkillBand[]): QuoteTx[] {
  return txs.filter((transaction) => matchesSkillBands(transaction.skills, bands));
}

export function quoteItem(input: {
  itemCode: string;
  skills: Record<string, number> | null;
  txs: QuoteTx[];
  nowMs: number;
}): ItemQuote {
  const skills = parseSkillNumbers(input.skills);
  const exactBands: SkillBand[] = Object.entries(skills ?? {}).map(([key, target]) => ({
    key,
    target,
    band: 0,
  }));
  const exactMatches = matchingTransactions(input.txs, exactBands);
  const exactQuote = quoteSufficientMatches(exactMatches, input.nowMs);
  if (exactQuote) return { ...exactQuote, widened: false };

  if (!skills) {
    return {
      median: calculateMedian(moneyValues(exactMatches)),
      trades: exactMatches.length,
      window: "thin",
      widened: false,
    };
  }

  const widenedBands = exactBands.map((skill) => ({ ...skill, band: 1 }));
  const widenedMatches = matchingTransactions(input.txs, widenedBands);
  const widenedQuote = quoteSufficientMatches(widenedMatches, input.nowMs);
  if (widenedQuote) return { ...widenedQuote, widened: true };

  return {
    median: calculateMedian(moneyValues(widenedMatches)),
    trades: widenedMatches.length,
    window: "thin",
    widened: true,
  };
}

export function quoteBatch(
  items: QuoteLineInput[],
  txsByCode: Map<string, QuoteTx[]>,
  nowMs: number,
): QuoteLineResult[] {
  return items.map((item) => ({
    id: item.id,
    ...quoteItem({
      itemCode: item.itemCode,
      skills: item.skills,
      txs: txsByCode.get(item.itemCode) ?? [],
      nowMs,
    }),
  }));
}
