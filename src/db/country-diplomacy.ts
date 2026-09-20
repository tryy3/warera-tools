import type { Db } from "./client";
import { countryDiplomacy } from "./schema";

export type CountryDiplomacyRow = typeof countryDiplomacy.$inferInsert;

export async function upsertCountryDiplomacy(db: Db, row: CountryDiplomacyRow): Promise<void> {
  const { countryId, ...rest } = row;
  await db
    .insert(countryDiplomacy)
    .values(row)
    .onConflictDoUpdate({
      target: countryDiplomacy.countryId,
      set: rest,
    });
}
