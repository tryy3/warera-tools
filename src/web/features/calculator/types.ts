export type Country = {
  id: string;
  name: string;
  taxRate: number;
};

export type CountriesResponse = { countries: Country[] };

export type ScrapsResponse = {
  price: number;
  fetchedAt: string;
  stale?: boolean;
};
