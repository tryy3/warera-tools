import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { countries } from "./schema";

export async function seedDefaultCountries(db: Db): Promise<void> {
  const existing = await db.select().from(countries).where(eq(countries.id, "sweden")).limit(1);
  const now = new Date();

  if (!existing[0]) {
    await db.insert(countries).values({
      id: "sweden",
      name: "Sweden",
      taxRate: 0.01,
      isoCode: "SE",
      createdAt: now,
      updatedAt: now,
    });
    return;
  }

  if (existing[0].isoCode == null) {
    await db
      .update(countries)
      .set({ isoCode: "SE", updatedAt: now })
      .where(eq(countries.id, "sweden"));
  }
}
