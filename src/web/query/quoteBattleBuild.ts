import type { QuoteLineInput, QuoteLineResult } from "@/battle-build/quote";
import { api } from "../api";

type QuoteResponse = {
  results: QuoteLineResult[];
  quotedAt: string;
};

export function quoteBattleBuild(items: QuoteLineInput[]): Promise<QuoteLineResult[]> {
  return api<QuoteResponse>("/api/battle-build/quote", {
    method: "POST",
    body: JSON.stringify({ items }),
  }).then((body) => body.results);
}
