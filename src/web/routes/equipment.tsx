import { createFileRoute } from "@tanstack/react-router";
import { EquipmentOverviewPage } from "../features/equipment-market/EquipmentOverviewPage";

export const Route = createFileRoute("/equipment")({
  component: EquipmentOverviewPage,
});
