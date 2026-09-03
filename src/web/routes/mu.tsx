import { createFileRoute } from "@tanstack/react-router";
import { MuSearchPage } from "../features/mu/MuSearchPage";

export const Route = createFileRoute("/mu")({
  component: MuSearchPage,
});
