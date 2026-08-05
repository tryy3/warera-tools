import { createFileRoute } from "@tanstack/react-router";
import { EquipmentDetailPage } from "../features/equipment-market/EquipmentDetailPage";

export const Route = createFileRoute("/equipment_/$itemCode")({
  component: EquipmentDetailPage,
});
