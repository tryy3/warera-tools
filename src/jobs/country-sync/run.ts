import type { CountrySyncResult } from "../../db/country-sync";
import { syncCountriesFromWarera } from "../../db/country-sync";
import type { Db } from "../../db/client";
import type { Logger } from "../../logging/logger";
import { fetchAllCountries } from "../../warera/countries";
import type { WareraRequester } from "../../warera/prices";

export async function runCountrySync(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
}): Promise<CountrySyncResult> {
  const rows = await fetchAllCountries(options.warera);
  const result = await syncCountriesFromWarera(options.db, rows);
  options.logger.info(result, "country sync complete");
  return result;
}
