import { useEffect, useMemo, useState } from "react";
import type { QuoteLineInput, QuoteLineResult } from "@/battle-build/quote";
import {
  LOADOUT_SLOT_ORDER,
  type Loadout,
  type LoadoutItem,
  type LoadoutSlotId,
} from "@/battle-build/slots";
import { quoteBattleBuild } from "../../query/quoteBattleBuild";

const QUOTE_DEBOUNCE_MS = 300;

export function createLoadoutItem(slot: LoadoutSlotId, itemCode: string): LoadoutItem {
  if (slot === "ammo" || slot === "food") return { itemCode, skills: {} };
  return {
    itemCode,
    skills: slot === "weapon" ? { attack: 0, criticalChance: 0 } : { armor: 0 },
  };
}

export function buildLoadoutQuoteItems(loadout: Loadout): QuoteLineInput[] {
  return LOADOUT_SLOT_ORDER.flatMap((slot) => {
    const item = loadout[slot];
    if (!item) return [];
    return [
      {
        id: slot,
        itemCode: item.itemCode,
        skills: Object.keys(item.skills).length > 0 ? item.skills : null,
      },
    ];
  });
}

export function sumLoadoutQuotes(quotes: QuoteLineResult[]): {
  total: number;
  quotedCount: number;
} {
  let total = 0;
  let quotedCount = 0;
  for (const quote of quotes) {
    if (quote.median == null || !Number.isFinite(quote.median)) continue;
    total += quote.median;
    quotedCount += 1;
  }
  return { total, quotedCount };
}

type QuoteState = {
  key: string;
  quotes: QuoteLineResult[];
  error: string | null;
};

type ScheduleLoadoutQuoteBatchOptions = {
  items: QuoteLineInput[];
  request?: (items: QuoteLineInput[]) => Promise<QuoteLineResult[]>;
  onSuccess: (quotes: QuoteLineResult[]) => void;
  onError: (error: unknown) => void;
  delayMs?: number;
};

export function scheduleLoadoutQuoteBatch({
  items,
  request = quoteBattleBuild,
  onSuccess,
  onError,
  delayMs = QUOTE_DEBOUNCE_MS,
}: ScheduleLoadoutQuoteBatchOptions): () => void {
  let active = true;
  const timeout = globalThis.setTimeout(() => {
    void request(items).then(
      (quotes) => {
        if (active) onSuccess(quotes);
      },
      (error: unknown) => {
        if (active) onError(error);
      },
    );
  }, delayMs);

  return () => {
    active = false;
    globalThis.clearTimeout(timeout);
  };
}

export function useLoadoutQuotes(loadout: Loadout): {
  quoteBySlot: Partial<Record<LoadoutSlotId, QuoteLineResult>>;
  quotes: QuoteLineResult[];
  pending: boolean;
  error: string | null;
} {
  const items = useMemo(() => buildLoadoutQuoteItems(loadout), [loadout]);
  const inputKey = JSON.stringify(items);
  const [state, setState] = useState<QuoteState>({
    key: "",
    quotes: [],
    error: null,
  });

  useEffect(() => {
    if (items.length === 0) return;
    return scheduleLoadoutQuoteBatch({
      items,
      onSuccess: (quotes) => {
        setState({ key: inputKey, quotes, error: null });
      },
      onError: (error) => {
        setState({
          key: inputKey,
          quotes: [],
          error: error instanceof Error ? error.message : "Could not load market quotes",
        });
      },
    });
  }, [inputKey, items]);

  const currentQuotes = state.key === inputKey ? state.quotes : [];
  const quoteBySlot = Object.fromEntries(
    currentQuotes.map((quote) => [quote.id, quote]),
  ) as Partial<Record<LoadoutSlotId, QuoteLineResult>>;

  return {
    quoteBySlot,
    quotes: currentQuotes,
    pending: items.length > 0 && state.key !== inputKey,
    error: state.key === inputKey ? state.error : null,
  };
}
