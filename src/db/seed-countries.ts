import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { countries } from "./schema";

export async function seedDefaultCountries(db: Db): Promise<void> {
  const existing = await db.select().from(countries).where(eq(countries.id, "sweden")).limit(1);
  if (existing[0]) return;
  const now = new Date();
  await db.insert(countries).values({
    id: "sweden",
    name: "Sweden",
    taxRate: 0.01,
    createdAt: now,
    updatedAt: now,
  });
}
