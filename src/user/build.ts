import type { Db } from "../db/client";
import { getLatestPrices, marketPriceMap } from "../db/prices";
import { loadCompanyPackForUser } from "../economy/load-company-pack";
import { runPricePoll } from "../jobs/price-poll/run";
import type { Logger } from "../logging/logger";
import { resolveJobWage } from "../skills/job-wage";
import type { WareraRequester } from "../warera/prices";
import { fetchUserLite } from "../warera/users";
import { mapUser } from "./map";
import type { UserResponse } from "./types";

export async function buildUser(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
  userId: string;
  refresh?: boolean;
}): Promise<UserResponse> {
  const { db, warera, logger, userId, refresh = false } = options;

  const [latestInitial, packResult, lite, job] = await Promise.all([
    getLatestPrices(db),
    loadCompanyPackForUser({ db, warera, userId, refresh }),
    fetchUserLite(warera, userId),
    resolveJobWage(warera, userId),
  ]);

  let latest = latestInitial;
  if (!latest) {
    await runPricePoll({ db, warera, logger });
    latest = await getLatestPrices(db);
  }
  const prices = latest ? marketPriceMap(latest) : {};

  return mapUser({
    userId,
    recordedAt: latest?.recordedAt.toISOString() ?? null,
    companiesFetchedAt: packResult.fetchedAt,
    companiesRefreshed: packResult.refreshed,
    packEntries: packResult.companies,
    prices,
    lite,
    job,
  });
}
