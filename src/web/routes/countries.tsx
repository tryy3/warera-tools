import { createFileRoute } from "@tanstack/react-router";
import { CountriesPage } from "../features/countries/CountriesPage";

export const Route = createFileRoute("/countries")({
  component: CountriesPage,
});
