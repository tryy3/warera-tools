import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { IdSearchField } from "../follow/IdSearchField";

export function MuSearchPage() {
  const navigate = useNavigate();
  const [muId, setMuId] = useState("");

  function goToMu(id: string) {
    const trimmed = id.trim();
    if (!trimmed) return;
    void navigate({ to: "/mu/$muId", params: { muId: trimmed } });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    goToMu(muId);
  }

  return (
    <section className="mx-auto max-w-[720px] rounded-md border border-border bg-card p-4 pb-6">
      <h1 className="m-0 text-[1.35rem] font-semibold tracking-tight">Military units</h1>
      <p className="mt-2 mb-4 text-muted-foreground">
        Search by name or paste a unit id to open stats, roster, and history.
      </p>

      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <IdSearchField id={muId} onIdChange={setMuId} onPick={goToMu} searchType="mu" />
        <div>
          <Button type="submit" variant="outline" size="sm" disabled={!muId.trim()}>
            Open unit
          </Button>
        </div>
      </form>
    </section>
  );
}
