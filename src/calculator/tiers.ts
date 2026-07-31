export type GearTierId = "gray" | "green" | "blue" | "purple" | "yellow" | "red";

export type GearTier = {
  id: GearTierId;
  label: string;
  scraps: number;
};

export const GEAR_TIERS: readonly GearTier[] = [
  { id: "gray", label: "Gray / Basic", scraps: 6 },
  { id: "green", label: "Green / Reinforced", scraps: 18 },
  { id: "blue", label: "Blue / Advanced", scraps: 54 },
  { id: "purple", label: "Purple / Elite", scraps: 162 },
  { id: "yellow", label: "Yellow / Legendary", scraps: 486 },
  { id: "red", label: "Red / Mythic", scraps: 1458 },
] as const;

export function scrapAmountForTier(tier: GearTierId): number {
  const found = GEAR_TIERS.find((t) => t.id === tier);
  if (!found) throw new Error(`Unknown tier: ${tier}`);
  return found.scraps;
}
