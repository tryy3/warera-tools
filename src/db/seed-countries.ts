import type { Db } from "./client";
import { countries } from "./schema";

/** Bootstrap Sweden when empty so the calculator works before the first country-sync. Sync migrates this row by ISO. */
export async function seedDefaultCountries(db: Db): Promise<void> {
  const any = await db.select({ id: countries.id }).from(countries).limit(1);
  if (any[0]) return;

  const now = new Date();
  await db.insert(countries).values({
    id: "sweden",
    name: "Sweden",
    taxRate: 0.01,
    isoCode: "SE",
    source: "manual",
    syncedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}
