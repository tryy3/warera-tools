import { eq } from "drizzle-orm";
import type { WareraCountryRow } from "../warera/countries";
import type { Db } from "./client";
import { countries } from "./schema";

export type CountrySyncResult = {
  total: number;
  inserted: number;
  updated: number;
  migrated: number;
};

type LocalCountry = typeof countries.$inferSelect;

function findMatchByIsoOrName(
  locals: LocalCountry[],
  row: WareraCountryRow,
): LocalCountry | undefined {
  const iso = row.isoCode.toUpperCase();
  return locals.find(
    (local) =>
      (local.isoCode != null && local.isoCode.toUpperCase() === iso) || local.name === row.name,
  );
}

export async function syncCountriesFromWarera(
  db: Db,
  rows: WareraCountryRow[],
  now: Date = new Date(),
): Promise<CountrySyncResult> {
  const result: CountrySyncResult = {
    total: rows.length,
    inserted: 0,
    updated: 0,
    migrated: 0,
  };

  let locals = await db.select().from(countries);

  for (const row of rows) {
    const byId = locals.find((local) => local.id === row.id);

    if (byId) {
      await db
        .update(countries)
        .set({
          name: row.name,
          isoCode: row.isoCode,
          taxRate: row.taxRate,
          source: "warera",
          syncedAt: now,
          updatedAt: now,
        })
        .where(eq(countries.id, row.id));
      result.updated++;
      locals = await db.select().from(countries);
      continue;
    }

    const match = findMatchByIsoOrName(locals, row);

    if (match && match.id !== row.id) {
      // Delete then insert: UNIQUE(name) blocks insert-before-delete when names match.
      await db.transaction(async (tx) => {
        await tx.delete(countries).where(eq(countries.id, match.id));
        await tx.insert(countries).values({
          id: row.id,
          name: row.name,
          isoCode: row.isoCode,
          taxRate: row.taxRate,
          source: "warera",
          syncedAt: now,
          createdAt: match.createdAt,
          updatedAt: now,
        });
      });
      result.migrated++;
      result.updated++;
      locals = await db.select().from(countries);
      continue;
    }

    await db.insert(countries).values({
      id: row.id,
      name: row.name,
      isoCode: row.isoCode,
      taxRate: row.taxRate,
      source: "warera",
      syncedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    result.inserted++;
    locals = await db.select().from(countries);
  }

  return result;
}
