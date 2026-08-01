import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { companyPacks } from "./schema";

export const DEFAULT_COMPANY_PACK_TTL_SECONDS = 600;

export type CompanyPackEntry = {
  id: string;
  name: string;
  itemCode: string | null;
  regionId: string | null;
  aeLevel: number;
  productionBonus: number | null;
  bonusDetails: {
    total: number;
    strategicBonus: number;
    depositBonus: number;
    ethicSpecializationBonus: number;
    ethicDepositBonus: number;
    formula: string;
  } | null;
};

export type CompanyPackRecord = {
  userId: string;
  companies: CompanyPackEntry[];
  fetchedAt: Date;
  ttlSeconds: number;
};

export function isCompanyPackFresh(
  fetchedAt: Date,
  ttlSeconds: number,
  now = new Date(),
): boolean {
  return now.getTime() - fetchedAt.getTime() < ttlSeconds * 1000;
}

export async function getCompanyPack(db: Db, userId: string): Promise<CompanyPackRecord | null> {
  const rows = await db.select().from(companyPacks).where(eq(companyPacks.userId, userId)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const companies = Array.isArray(row.payload) ? (row.payload as CompanyPackEntry[]) : [];
  return {
    userId: row.userId,
    companies,
    fetchedAt: row.fetchedAt,
    ttlSeconds: row.ttlSeconds,
  };
}

export async function upsertCompanyPack(
  db: Db,
  pack: {
    userId: string;
    companies: CompanyPackEntry[];
    fetchedAt: Date;
    ttlSeconds?: number;
  },
): Promise<void> {
  const ttlSeconds = pack.ttlSeconds ?? DEFAULT_COMPANY_PACK_TTL_SECONDS;
  await db
    .insert(companyPacks)
    .values({
      userId: pack.userId,
      payload: pack.companies,
      fetchedAt: pack.fetchedAt,
      ttlSeconds,
    })
    .onConflictDoUpdate({
      target: companyPacks.userId,
      set: {
        payload: pack.companies,
        fetchedAt: pack.fetchedAt,
        ttlSeconds,
      },
    });
}
