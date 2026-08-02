import { formatDisplayNumber } from "@/lib/formatDisplayNumber";

export function formatGold(value: number, digits = 2): string {
  return formatDisplayNumber(value, digits);
}

export function formatSignedGold(value: number, digits = 2): string {
  const body = formatGold(Math.abs(value), digits);
  if (value > 0) return `+${body}`;
  if (value < 0) return `−${body}`;
  return body;
}

export function skillLabel(id: string): string {
  switch (id) {
    case "energy":
      return "Energy";
    case "entrepreneurship":
      return "Entrepreneurship";
    case "production":
      return "Production";
    case "companies":
      return "Companies Limit";
    case "management":
      return "Management";
    default:
      return id.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
  }
}
