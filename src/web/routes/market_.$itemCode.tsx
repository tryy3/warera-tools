import { createFileRoute } from "@tanstack/react-router";

function MarketItemStub() {
  const { itemCode } = Route.useParams();
  return (
    <div className="mx-auto max-w-[1200px] rounded-md border border-border bg-card p-4">
      <p className="m-0 text-muted-foreground">
        Price chart for <strong className="text-foreground">{itemCode}</strong> will land in a
        follow-up.
      </p>
    </div>
  );
}

export const Route = createFileRoute("/market_/$itemCode")({
  component: MarketItemStub,
});
