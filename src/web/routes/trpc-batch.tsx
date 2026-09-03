import { createFileRoute } from "@tanstack/react-router";
import { TrpcBatchPage } from "../features/trpc-batch/TrpcBatchPage";

export const Route = createFileRoute("/trpc-batch")({
  component: TrpcBatchPage,
});
