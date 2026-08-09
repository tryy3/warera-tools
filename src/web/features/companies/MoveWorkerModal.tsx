import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-secondary px-2.5 text-sm text-foreground scheme-dark outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export type MoveCompanyOption = {
  id: string;
  name: string;
};

type MoveWorkerModalProps = {
  open: boolean;
  workerName: string;
  companies: MoveCompanyOption[];
  currentAssignment: string | null;
  onClose: () => void;
  onSubmit: (assignment: string | null) => void;
};

export function MoveWorkerModal({
  open,
  workerName,
  companies,
  currentAssignment,
  onClose,
  onSubmit,
}: MoveWorkerModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formId = useId();
  const [target, setTarget] = useState(currentAssignment ?? "");

  const wasOpenRef = useRef(false);
  const assignmentRef = useRef(currentAssignment);
  assignmentRef.current = currentAssignment;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!wasOpenRef.current) {
        setTarget(assignmentRef.current ?? "");
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
    onSubmit(target === "" ? null : target);
  }

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-[min(22rem,calc(100%-2rem))] rounded-lg border border-border bg-card p-4 text-foreground shadow-lg backdrop:bg-black/60"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <h2 className="m-0 text-base font-semibold">Move worker</h2>
        <p className="m-0 text-sm text-muted-foreground">
          Move <strong className="text-foreground">{workerName}</strong> to another company.
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-target`}>Target</Label>
          <select
            id={`${formId}-target`}
            className={selectClassName}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            autoFocus
          >
            <option value="">Unassigned</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm">
            Move
          </Button>
        </div>
      </form>
    </dialog>
  );
}
