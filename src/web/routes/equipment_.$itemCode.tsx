import { createFileRoute } from "@tanstack/react-router";

/** Placeholder until Task 8 wires EquipmentDetailPage. */
export const Route = createFileRoute("/equipment_/$itemCode")({
  component: function EquipmentDetailPlaceholder() {
    const { itemCode } = Route.useParams();
    return (
      <div className="mx-auto max-w-[1200px] rounded-md border border-border bg-card p-4">
        <p className="m-0 text-muted-foreground">
          Equipment detail for <span className="font-mono text-foreground">{itemCode}</span> is not
          ready yet.
        </p>
      </div>
    );
  },
});
