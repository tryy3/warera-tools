import type { ParsedAlliance } from "../warera/alliances";
import type { Db } from "./client";
import { alliances } from "./schema";

export async function upsertAlliances(
  db: Db,
  rows: ParsedAlliance[],
  fetchedAt: Date = new Date(),
): Promise<number> {
  for (const row of rows) {
    await db
      .insert(alliances)
      .values({
        id: row.id,
        name: row.name,
        coreDevelopment: row.coreDevelopment,
        fetchedAt,
      })
      .onConflictDoUpdate({
        target: alliances.id,
        set: {
          name: row.name,
          coreDevelopment: row.coreDevelopment,
          fetchedAt,
        },
      });
  }
  return rows.length;
}
