import { createFileRoute } from "@tanstack/react-router";
import { CalculatorPage } from "../features/calculator/CalculatorPage";
import { parseCalculatorSearch } from "../lib/calculatorSearch";

export const Route = createFileRoute("/calculator")({
  validateSearch: (search: Record<string, unknown>) => parseCalculatorSearch(search),
  component: CalculatorPage,
});
