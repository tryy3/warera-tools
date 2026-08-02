import {
  getCompanyPack,
  isCompanyPackFresh,
  upsertCompanyPack,
  type CompanyPackEntry,
} from "../db/company-packs";
import type { Db } from "../db/client";
import { enqueueRegions } from "../db/regions";
import { fetchCompaniesByUserId, fetchCompanyProductionBonus } from "../warera/companies";
import type { WareraRequester } from "../warera/prices";

export async function loadCompanyPackForUser(options: {
  db: Db;
  warera: WareraRequester;
  userId: string;
  refresh?: boolean;
}): Promise<{
  companies: CompanyPackEntry[];
  fetchedAt: number | null;
  refreshed: boolean;
}> {
  const { db, warera, userId, refresh = false } = options;
  const existingPack = await getCompanyPack(db, userId);
  const packFresh =
    existingPack != null && isCompanyPackFresh(existingPack.fetchedAt, existingPack.ttlSeconds);

  if (!refresh && packFresh && existingPack) {
    return {
      companies: existingPack.companies,
      fetchedAt: existingPack.fetchedAt.getTime(),
      refreshed: false,
    };
  }

  const live = await fetchCompaniesByUserId(warera, userId);
  const enrichedLive = await Promise.all(
    live.map(async (c) => {
      const bonusDetails =
        c.productionBonus != null ? null : await fetchCompanyProductionBonus(warera, c.id);
      const productionBonus = bonusDetails?.total ?? c.productionBonus ?? null;
      return {
        id: c.id,
        name: c.name,
        itemCode: c.itemCode,
        regionId: c.regionId,
        aeLevel: c.aeLevel,
        productionBonus,
        bonusDetails:
          bonusDetails ??
          (productionBonus != null
            ? {
                total: productionBonus,
                strategicBonus: 0,
                depositBonus: 0,
                ethicSpecializationBonus: 0,
                ethicDepositBonus: 0,
                formula: `total ${productionBonus * 100}%`,
              }
            : null),
      } satisfies CompanyPackEntry;
    }),
  );
  const fetchedAt = new Date();
  await upsertCompanyPack(db, { userId, companies: enrichedLive, fetchedAt });
  await enqueueRegions(
    db,
    enrichedLive.flatMap((e) => (e.regionId ? [e.regionId] : [])),
    fetchedAt,
  );

  return {
    companies: enrichedLive,
    fetchedAt: fetchedAt.getTime(),
    refreshed: true,
  };
}
