import type { Db } from "./client";
import { battleBonusFacts } from "./schema";

export type BattleBonusFactsRow = Omit<typeof battleBonusFacts.$inferInsert, "battleId">;

export async function upsertBattleBonusFacts(
  db: Db,
  battleId: string,
  facts: BattleBonusFactsRow,
): Promise<void> {
  await db
    .insert(battleBonusFacts)
    .values({ battleId, ...facts })
    .onConflictDoUpdate({
      target: battleBonusFacts.battleId,
      set: facts,
    });
}
