export function parseScrapsPrice(trpcJson: unknown): number {
  const data = (trpcJson as { result?: { data?: { scraps?: unknown } } })?.result?.data;
  const price = data?.scraps;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    throw new Error("WarEra itemTrading.getPrices did not return a valid scraps price");
  }
  return price;
}

export async function fetchScrapsPrice(warera: {
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
}): Promise<number> {
  const json = await warera.request<unknown>("itemTrading.getPrices");
  return parseScrapsPrice(json);
}
