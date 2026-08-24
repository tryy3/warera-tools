import { createFileRoute } from "@tanstack/react-router";

function MuDetailPlaceholder() {
  const { muId } = Route.useParams();
  return (
    <section className="mx-auto max-w-[720px] rounded-md border border-border bg-card p-4">
      <h1 className="m-0 text-[1.35rem] font-semibold tracking-tight">Military unit</h1>
      <p className="mt-2 text-muted-foreground">
        Detail view for <span className="font-mono text-foreground">{muId}</span> — coming in Task
        7.
      </p>
    </section>
  );
}

export const Route = createFileRoute("/mu_/$muId")({
  component: MuDetailPlaceholder,
});
