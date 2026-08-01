import { getRecipe } from "../economy/recipes";

export type MarketItemGroup = "raw" | "manufactured" | "other";

export function marketItemGroup(itemCode: string): MarketItemGroup {
  const recipe = getRecipe(itemCode);
  if (!recipe) return "other";
  return recipe.inputs.length === 0 ? "raw" : "manufactured";
}

export function groupMarketItems<T extends { itemCode: string }>(
  items: T[],
): {
  raw: T[];
  manufactured: T[];
  other: T[];
} {
  const raw: T[] = [];
  const manufactured: T[] = [];
  const other: T[] = [];
  for (const item of items) {
    const group = marketItemGroup(item.itemCode);
    if (group === "raw") raw.push(item);
    else if (group === "manufactured") manufactured.push(item);
    else other.push(item);
  }
  return { raw, manufactured, other };
}
