/** Production recipes — consumed PP + input items (wiki / companies.md). */

export type RecipeInput = { itemCode: string; quantity: number };

export type Recipe = {
  itemCode: string;
  /** PP consumed at Produce for this item (not including embedded input PP). */
  consumedPp: number;
  inputs: RecipeInput[];
  /** Whether this is a company-producible factory output we advise on. */
  producible: boolean;
};

const RECIPES: Recipe[] = [
  { itemCode: "grain", consumedPp: 1, inputs: [], producible: true },
  { itemCode: "limestone", consumedPp: 1, inputs: [], producible: true },
  { itemCode: "lead", consumedPp: 1, inputs: [], producible: true },
  { itemCode: "petroleum", consumedPp: 1, inputs: [], producible: true },
  { itemCode: "coca", consumedPp: 1, inputs: [], producible: true },
  { itemCode: "iron", consumedPp: 1, inputs: [], producible: true },
  { itemCode: "wood", consumedPp: 1, inputs: [], producible: true },
  { itemCode: "livestock", consumedPp: 20, inputs: [], producible: true },
  { itemCode: "fish", consumedPp: 40, inputs: [], producible: true },
  {
    itemCode: "steel",
    consumedPp: 10,
    inputs: [{ itemCode: "iron", quantity: 10 }],
    producible: true,
  },
  {
    itemCode: "concrete",
    consumedPp: 10,
    inputs: [{ itemCode: "limestone", quantity: 10 }],
    producible: true,
  },
  {
    itemCode: "oil",
    consumedPp: 1,
    inputs: [{ itemCode: "petroleum", quantity: 1 }],
    producible: true,
  },
  {
    itemCode: "bread",
    consumedPp: 10,
    inputs: [{ itemCode: "grain", quantity: 10 }],
    producible: true,
  },
  {
    itemCode: "steak",
    consumedPp: 20,
    inputs: [{ itemCode: "livestock", quantity: 1 }],
    producible: true,
  },
  {
    itemCode: "cookedFish",
    consumedPp: 40,
    inputs: [{ itemCode: "fish", quantity: 1 }],
    producible: true,
  },
  {
    itemCode: "lightAmmo",
    consumedPp: 1,
    inputs: [{ itemCode: "lead", quantity: 1 }],
    producible: true,
  },
  {
    itemCode: "ammo",
    consumedPp: 4,
    inputs: [{ itemCode: "lead", quantity: 4 }],
    producible: true,
  },
  {
    itemCode: "heavyAmmo",
    consumedPp: 16,
    inputs: [{ itemCode: "lead", quantity: 16 }],
    producible: true,
  },
  {
    itemCode: "cocain",
    consumedPp: 200,
    inputs: [{ itemCode: "coca", quantity: 200 }],
    producible: true,
  },
];

const BY_CODE = new Map(RECIPES.map((r) => [r.itemCode, r]));

export function listProducibleRecipes(): Recipe[] {
  return RECIPES.filter((r) => r.producible);
}

export function getRecipe(itemCode: string): Recipe | undefined {
  return BY_CODE.get(itemCode);
}

/** Retask (change material) cost in Concrete units. */
export const RETASK_CONCRETE = 5;
/** Relocate (change region) cost in Concrete units. */
export const RELOCATE_CONCRETE = 5;
