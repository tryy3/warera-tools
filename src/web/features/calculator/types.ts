export type Country = {
  id: string;
  name: string;
  taxRate: number;
  isoCode: string | null;
};

export type CountriesResponse = { countries: Country[] };

export type ScrapsResponse = {
  price: number;
  fetchedAt: string;
  stale?: boolean;
};
