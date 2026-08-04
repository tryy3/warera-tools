import { MoreVertical } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type WorkerRowActionsProps = {
  assigned: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onMove: () => void;
};

export function WorkerRowActions({
  assigned,
  onEdit,
  onToggleActive,
  onMove,
}: WorkerRowActionsProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Worker actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreVertical />
      </Button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute top-full right-0 z-20 mt-1 min-w-36 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
            onClick={() => {
              setOpen(false);
              onToggleActive();
            }}
          >
            {assigned ? "Deactivate" : "Activate"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
            onClick={() => {
              setOpen(false);
              onMove();
            }}
          >
            Move to…
          </button>
        </div>
      ) : null}
    </div>
  );
}
