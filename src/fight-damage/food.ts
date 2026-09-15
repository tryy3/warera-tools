export const FIGHT_FOOD_OPTIONS = [
  { id: "none", label: "None", bonus: 0 },
  { id: "steak", label: "Steak (+15%)", bonus: 0.15 },
] as const;

export function foodBonusForId(foodId: string): number {
  return FIGHT_FOOD_OPTIONS.find((food) => food.id === foodId)?.bonus ?? 0;
}
