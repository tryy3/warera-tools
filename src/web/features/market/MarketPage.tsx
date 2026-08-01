import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { groupMarketItems } from "@/market/groupItems";
import { api } from "../../api";
import { MarketItemCard } from "./MarketItemCard";
import type { LatestPriceItem, LatestPricesResponse } from "./types";

const SECTIONS: Array<{ key: "raw" | "manufactured" | "other"; title: string }> = [
  { key: "raw", title: "Raw materials" },
  { key: "manufactured", title: "Manufactured goods" },
  { key: "other", title: "Other" },
];

export function MarketPage() {
  const [items, setItems] = useState<LatestPriceItem[]>([]);
  const [recordedAt, setRecordedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadLatest({ showLoading = true } = {}) {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await api<LatestPricesResponse>("/api/prices/latest");
      setItems(data.items);
      setRecordedAt(data.recordedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
      setRecordedAt(null);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    void loadLatest();
  }, []);

  async function refreshPrices() {
    setPolling(true);
    setError(null);
    try {
      await api("/api/prices/poll", { method: "POST" });
      await loadLatest({ showLoading: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPolling(false);
    }
  }

  const grouped = groupMarketItems(items);
  const hasItems = items.length > 0;

  return (
    <div className="mx-auto max-w-[1200px] rounded-md border border-border bg-card p-4 pb-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h1 className="mb-0.5 text-[1.35rem] font-semibold tracking-tight">Market</h1>
          <p className="m-0 text-muted-foreground">
            Current market prices by item. Buy is highest bid; Sell is lowest ask.
            {recordedAt ? ` · as of ${new Date(recordedAt).toLocaleString()}` : null}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={polling || loading}
          onClick={() => void refreshPrices()}
        >
          {polling ? "Refreshing…" : "Refresh prices"}
        </Button>
      </div>

      {error ? <p className="my-2 text-destructive">{error}</p> : null}
      {loading ? <p className="text-muted-foreground">Loading prices…</p> : null}

      {!loading && !hasItems && !error ? (
        <p className="text-muted-foreground">No price data yet — refresh prices</p>
      ) : null}

      {!loading && hasItems
        ? SECTIONS.map(({ key, title }) => {
            const sectionItems = grouped[key];
            if (sectionItems.length === 0) return null;
            return (
              <section key={key} className="mt-5">
                <h2 className="mt-0 mb-2 text-[1.05rem] font-semibold">{title}</h2>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {sectionItems.map((item) => (
                    <MarketItemCard key={item.itemCode} item={item} />
                  ))}
                </div>
              </section>
            );
          })
        : null}
    </div>
  );
}
