# Player battle loot

**Date:** 2026-10-09
**Route:** `/player?userId=...`, API `GET /api/player-battles?userId=&refresh=`
**Tier:** User (live, demand-driven). No job, no table. Generic `cache` KV with a 60s TTL, `refresh=1` bypasses it.

## What it shows

For one player at a time: each active battle they have fought in, with their side, damage, rank, the prize on the rank slot they hold (rarity tier and equipment type only), and the next round tick countdown. Per battle there are two ladders, round prizes and battle prizes. Each ladder lists the slots above the player with `damage needed = holder damage - my damage + 1`, plus two filters: the cheapest slot of a strictly higher tier, and slots of the same or better tier with a different equipment type. A header counts the prizes held now across battles by tier and type. Case drops are informational only.

## Algorithm

1. `battle.getBattles` drained by cursor.
2. `battleLootSummary.getByBattleAndUser` for every battle. NOT_FOUND means the player has not fought there. Gives battle damage, hits, case counts.
3. `battleRanking.getRanking` (`dataType: damage`, `type: user`) for each fought battle, for both sides and for both scopes (`roundId` for round prizes, `battleId` for battle prizes). Pages are followed up to 5 deep.
4. A ranking row may carry a `lootItem`. That item is pre-rolled and belongs to the rank slot, not to the holder. Only rows that carry one are prize slots, so the slot count is derived and never assumed.
5. The loot summary has no side. The side is where the player appears in the round rankings, then the battle rankings. With no hit the side is unknown and both sides are listed.
6. Round damage comes from the ranking row. Battle damage comes from the live loot summary, which can be ahead of the ranking between ticks. Then `damage needed` clamps to 0 and the UI says "next tick".

Rankings change only on round ticks (about 2 minutes), which is why 60s is enough.

## Structure

- `src/battle-loot/ladder.ts` and `battle.ts`: pure domain, no I/O. `buildLootLadder`, `resolveBattleLadders`, `tallyLoot`. Tier and type come from `src/equipment/catalog.ts` (`GearTierId`, `EquipmentSlot`).
- `src/warera/battle-ranking.ts`: boundary parser and batched page walker.
- `src/player-battles/build.ts`: orchestration and KV cache. `src/server/routes/player-battles.ts`: thin route.
- `src/web/features/player/`: page, battle card, ladder panel.

## Call budget

All ranking pages of one depth go out in one tRPC batch, and loot summaries go out in groups of 8, so the call count does not grow with the number of battles. Per-call requests are paced by the 120/min limiter and took about 36s for a player in no battle before this change, about 0.3s after.

The client throws when every slot of a batch is NOT_FOUND (api2 answers HTTP 404 instead of 207). Groups of 8 stay inside one URL chunk so a thrown group cannot discard the results of another.

## Known limits

- Item stats are not shown by design. The in-game numbers are not always accurate and this algorithm is the agreed source of truth.
- A player ranked deeper than 5 pages (500 rows) on a side is treated as unranked there, and the panel says so.
- Country and region names come from the Geo tables (`countries`, `regions`) when warm and show "Unknown" otherwise. They are not live-filled.
