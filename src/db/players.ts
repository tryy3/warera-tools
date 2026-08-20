import type { Db } from "./client";
import { players } from "./schema";

export async function upsertPlayerCurrent(
  db: Db,
  row: {
    id: string;
    username: string | null;
    muId: string | null;
    workplaceCompanyId: string | null;
    payload: Record<string, unknown> | null;
    fetchedAt: Date;
  },
): Promise<void> {
  await db
    .insert(players)
    .values({
      id: row.id,
      username: row.username,
      muId: row.muId,
      workplaceCompanyId: row.workplaceCompanyId,
      payload: row.payload,
      fetchedAt: row.fetchedAt,
    })
    .onConflictDoUpdate({
      target: players.id,
      set: {
        username: row.username,
        muId: row.muId,
        workplaceCompanyId: row.workplaceCompanyId,
        payload: row.payload,
        fetchedAt: row.fetchedAt,
      },
    });
}
