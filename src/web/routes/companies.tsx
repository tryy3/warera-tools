import { createFileRoute } from "@tanstack/react-router";
import { CompaniesPage } from "../features/companies/CompaniesPage";
import { parseCompaniesSearch } from "../lib/companiesSearch";

export const Route = createFileRoute("/companies")({
  validateSearch: (search: Record<string, unknown>) => parseCompaniesSearch(search),
  component: CompaniesPage,
});
