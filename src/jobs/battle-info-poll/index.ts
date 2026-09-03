import type { JobDefinition } from "../types";
import { runBattleInfoPoll } from "./run";

export const battleInfoPollJob: JobDefinition = {
  id: "battle-info-poll",
  name: "Battle Info Poll",
  description:
    "Tracks battles where watched MUs have orders; scoreboard + loot snapshots; finalizes ended battles via getById",
  defaultCron: "0 */15 * * * *",
  defaultEnabled: true,
  async run({ db, logger, warera }) {
    const result = await runBattleInfoPoll({ db, warera, logger });
    return `poll #${result.pollId}: ${result.battleCount} battles, ${result.lootSnapshotCount} loot, ${result.finalizedCount} finalized (${result.status})`;
  },
};
