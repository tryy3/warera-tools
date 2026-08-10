import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { GoldIcon } from "../../components/GoldIcon";
import { ItemIcon } from "../../components/ItemIcon";
import { useItemPriceBoard } from "./sessionPrices/ItemPriceBoardProvider";
import type { Opportunity } from "./types";

function formatItem(code: string): string {
  return code.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function formatNum(value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatDisplayNumber(value, digits);
}

type OpportunityItemModalProps = {
  open: boolean;
  opportunity: Opportunity | null;
  onClose: () => void;
};

export function OpportunityItemModal({ open, opportunity, onClose }: OpportunityItemModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formId = useId();
  const board = useItemPriceBoard();
  const itemCode = opportunity?.itemCode;
  const live = itemCode ? board.liveOpportunity(itemCode) : undefined;
  const buyDirty = itemCode != null && board.isDirty(itemCode, "buy");
  const sellDirty = itemCode != null && board.isDirty(itemCode, "sell");

  const [buyDraft, setBuyDraft] = useState("");
  const [sellDraft, setSellDraft] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open || !opportunity) return;
    setBuyDraft(
      opportunity.buyPrice != null && Number.isFinite(opportunity.buyPrice)
        ? String(opportunity.buyPrice)
        : "",
    );
    setSellDraft(
      opportunity.sellPrice != null && Number.isFinite(opportunity.sellPrice)
        ? String(opportunity.sellPrice)
        : "",
    );
  }, [open, opportunity]);

  function handleApply(event: FormEvent) {
    event.preventDefault();
    if (!itemCode) return;
    const buy = buyDraft.trim() === "" ? undefined : Number(buyDraft);
    const sell = sellDraft.trim() === "" ? undefined : Number(sellDraft);
    if (buy != null && !Number.isFinite(buy)) return;
    if (sell != null && !Number.isFinite(sell)) return;

    const liveBuy = live?.buyPrice;
    const liveSell = live?.sellPrice;
    board.setItemPrices(itemCode, {
      buy: buy != null && (liveBuy == null || buy !== liveBuy) ? buy : undefined,
      sell: sell != null && (liveSell == null || sell !== liveSell) ? sell : undefined,
    });
  }

  function handleReset() {
    if (!itemCode) return;
    board.resetItem(itemCode);
    if (live) {
      setBuyDraft(live.buyPrice != null ? String(live.buyPrice) : "");
      setSellDraft(live.sellPrice != null ? String(live.sellPrice) : "");
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-lg border border-border bg-card p-4 text-foreground shadow-lg scheme-dark backdrop:bg-black/60"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      {opportunity ? (
        <form id={formId} className="flex flex-col gap-3" onSubmit={handleApply}>
          <h2 className="m-0 flex items-center gap-2 text-base font-semibold">
            <ItemIcon itemCode={opportunity.itemCode} />
            {formatItem(opportunity.itemCode)}
          </h2>

          <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <div>
              <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                Live buy
              </dt>
              <dd className="mt-0.5 mb-0 font-mono text-success">
                {live?.buyPrice != null ? (
                  <span className="inline-flex items-center gap-1.5">
                    <GoldIcon />
                    {formatNum(live.buyPrice)}
                  </span>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                Live sell
              </dt>
              <dd className="mt-0.5 mb-0 font-mono text-destructive">
                {live?.sellPrice != null ? (
                  <span className="inline-flex items-center gap-1.5">
                    <GoldIcon />
                    {formatNum(live.sellPrice)}
                  </span>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                G/PP
              </dt>
              <dd className="mt-0.5 mb-0 font-mono">
                {opportunity.profitPerPp != null ? (
                  <span className="inline-flex items-center gap-1.5">
                    <GoldIcon />
                    {formatNum(opportunity.profitPerPp)}
                  </span>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                ~G/day
              </dt>
              <dd className="mt-0.5 mb-0 font-mono">
                {opportunity.roughDailyValue != null ? (
                  <span className="inline-flex items-center gap-1.5">
                    <GoldIcon />
                    {formatNum(opportunity.roughDailyValue, 2)}
                  </span>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor={`${formId}-buy`}
                className={buyDirty ? "text-amber-200" : "text-success"}
              >
                Buy (session)
              </Label>
              <Input
                id={`${formId}-buy`}
                className={`bg-secondary dark:bg-secondary font-mono ${
                  buyDirty ? "text-amber-200" : "text-success"
                }`}
                type="number"
                inputMode="decimal"
                min={0}
                step={0.001}
                value={buyDraft}
                onChange={(e) => setBuyDraft(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor={`${formId}-sell`}
                className={sellDirty ? "text-amber-200" : "text-destructive"}
              >
                Sell (session)
              </Label>
              <Input
                id={`${formId}-sell`}
                className={`bg-secondary dark:bg-secondary font-mono ${
                  sellDirty ? "text-amber-200" : "text-destructive"
                }`}
                type="number"
                inputMode="decimal"
                min={0}
                step={0.001}
                value={sellDraft}
                onChange={(e) => setSellDraft(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded border border-dashed border-primary/35 bg-black/20 px-2.5 py-2">
            <div className="mb-0.5 text-[0.7em] tracking-wider text-primary uppercase">Formula</div>
            <code className="block font-mono text-[0.78em] leading-snug break-words whitespace-pre-wrap text-foreground">
              {opportunity.formula}
            </code>
          </div>

          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleReset}>
              Reset to live
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button type="submit" size="sm">
              Apply
            </Button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}
