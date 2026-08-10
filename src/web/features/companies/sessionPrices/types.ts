export type ItemPriceOverride = {
  buy?: number;
  sell?: number;
};

export type ItemPriceOverrides = Record<string, ItemPriceOverride>;
