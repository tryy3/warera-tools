import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { skillValueFromLevel } from "@/skills/values";

const SKILL_LEVELS = Array.from({ length: 21 }, (_, i) => i);

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export type SimWorkerDraft = {
  name: string;
  wagePerPp: number;
  fidelityPct: number;
  energyLevel: number;
  productionLevel: number;
  activeFromStart: boolean;
};

type SimWorkerModalProps = {
  open: boolean;
  mode: "create" | "edit";
  initial: SimWorkerDraft;
  onClose: () => void;
  onSubmit: (draft: SimWorkerDraft) => void;
};

function applyDraft(
  draft: SimWorkerDraft,
  setters: {
    setName: (v: string) => void;
    setWagePerPp: (v: string) => void;
    setFidelityPct: (v: string) => void;
    setEnergyLevel: (v: number) => void;
    setProductionLevel: (v: number) => void;
    setActiveFromStart: (v: boolean) => void;
  },
) {
  setters.setName(draft.name);
  setters.setWagePerPp(String(draft.wagePerPp));
  setters.setFidelityPct(String(draft.fidelityPct));
  setters.setEnergyLevel(draft.energyLevel);
  setters.setProductionLevel(draft.productionLevel);
  setters.setActiveFromStart(draft.activeFromStart);
}

export function SimWorkerModal({ open, mode, initial, onClose, onSubmit }: SimWorkerModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formId = useId();
  const wasOpenRef = useRef(false);
  const initialRef = useRef(initial);
  initialRef.current = initial;

  const [name, setName] = useState(initial.name);
  const [wagePerPp, setWagePerPp] = useState(String(initial.wagePerPp));
  const [fidelityPct, setFidelityPct] = useState(String(initial.fidelityPct));
  const [energyLevel, setEnergyLevel] = useState(initial.energyLevel);
  const [productionLevel, setProductionLevel] = useState(initial.productionLevel);
  const [activeFromStart, setActiveFromStart] = useState(initial.activeFromStart);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!wasOpenRef.current) {
        applyDraft(initialRef.current, {
          setName,
          setWagePerPp,
          setFidelityPct,
          setEnergyLevel,
          setProductionLevel,
          setActiveFromStart,
        });
      }
      wasOpenRef.current = true;
      if (!dialog.open) dialog.showModal();
    } else {
      wasOpenRef.current = false;
      if (dialog.open) dialog.close();
    }
  }, [open]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const wage = Number(wagePerPp);
    const fidelity = Number(fidelityPct);
    if (!name.trim() || !Number.isFinite(wage) || wage < 0) return;
    if (!Number.isFinite(fidelity) || fidelity < 0 || fidelity > 10) return;
    onSubmit({
      name: name.trim(),
      wagePerPp: wage,
      fidelityPct: fidelity,
      energyLevel,
      productionLevel,
      activeFromStart,
    });
  }

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-[min(24rem,calc(100%-2rem))] rounded-lg border border-border bg-card p-4 text-foreground shadow-lg backdrop:bg-black/60"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <form id={formId} className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <h2 className="m-0 text-base font-semibold">
          {mode === "create" ? "Add simulated worker" : "Edit worker"}
        </h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-name`}>Name</Label>
          <Input
            id={`${formId}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-wage`}>Wage / PP (gross)</Label>
          <Input
            id={`${formId}-wage`}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={wagePerPp}
            onChange={(e) => setWagePerPp(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-fidelity`}>Fidelity %</Label>
          <Input
            id={`${formId}-fidelity`}
            type="number"
            inputMode="decimal"
            min={0}
            max={10}
            step={1}
            value={fidelityPct}
            onChange={(e) => setFidelityPct(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-energy`}>Energy</Label>
          <select
            id={`${formId}-energy`}
            className={selectClassName}
            value={energyLevel}
            onChange={(e) => setEnergyLevel(Number(e.target.value))}
          >
            {SKILL_LEVELS.map((level) => (
              <option key={level} value={level}>
                Lv {level} – {skillValueFromLevel("energy", level)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-production`}>Production</Label>
          <select
            id={`${formId}-production`}
            className={selectClassName}
            value={productionLevel}
            onChange={(e) => setProductionLevel(Number(e.target.value))}
          >
            {SKILL_LEVELS.map((level) => (
              <option key={level} value={level}>
                Lv {level} – {skillValueFromLevel("production", level)}
              </option>
            ))}
          </select>
        </div>

        {mode === "create" ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={activeFromStart}
              onChange={(e) => setActiveFromStart(e.target.checked)}
              className="size-3.5 accent-primary"
            />
            Worker active from start
          </label>
        ) : null}

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm">
            {mode === "create" ? "Add worker" : "Save"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
