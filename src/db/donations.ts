import { and, desc, eq } from "drizzle-orm";
import type { Db } from "./client";
import { donationPolls, donationSnapshots } from "./schema";

export function donationFingerprintKey(
  scopeType: string,
  scopeId: string,
  userId: string,
): string {
  return `${scopeType}:${scopeId}:${userId}`;
}

export function donationAmountFingerprint(amount: number | null): string {
  return amount == null ? "null" : String(amount);
}

/** keys are `${scopeType}:${scopeId}:${userId}` */
export async function loadLatestDonationAmountFingerprints(
  db: Db,
  keys: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (keys.length === 0) return out;

  const triples = keys.map((key) => {
    const [scopeType, scopeId, userId] = key.split(":");
    return { scopeType: scopeType!, scopeId: scopeId!, userId: userId! };
  });

  for (const { scopeType, scopeId, userId } of triples) {
    const rows = await db
      .select({
        amount: donationSnapshots.amount,
        pollId: donationSnapshots.pollId,
      })
      .from(donationSnapshots)
      .where(
        and(
          eq(donationSnapshots.scopeType, scopeType),
          eq(donationSnapshots.scopeId, scopeId),
          eq(donationSnapshots.userId, userId),
        ),
      )
      .orderBy(desc(donationSnapshots.pollId))
      .limit(1);
    const row = rows[0];
    if (row) {
      out.set(
        donationFingerprintKey(scopeType, scopeId, userId),
        donationAmountFingerprint(row.amount),
      );
    }
  }
  return out;
}

export type DonationSnapshotRow = {
  scopeType: string;
  scopeId: string;
  userId: string;
  donationRowId: string | null;
  amount: number | null;
  donationCreatedAt: Date | null;
  donationUpdatedAt: Date | null;
  payload: Record<string, unknown> | null;
};

export async function insertDonationPoll(
  db: Db,
  values: {
    recordedAt: Date;
    status: string;
    error?: string | null;
    scopeCount: number;
    rowCount: number;
  },
): Promise<number> {
  const result = await db
    .insert(donationPolls)
    .values({
      recordedAt: values.recordedAt,
      status: values.status,
      error: values.error ?? null,
      scopeCount: values.scopeCount,
      rowCount: values.rowCount,
    })
    .returning({ id: donationPolls.id });
  const id = result[0]?.id;
  if (id == null) throw new Error("Failed to insert donation_polls row");
  return id;
}

export async function insertDonationSnapshots(
  db: Db,
  pollId: number,
  rows: DonationSnapshotRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(donationSnapshots).values(
    rows.map((row) => ({
      pollId,
      scopeType: row.scopeType,
      scopeId: row.scopeId,
      userId: row.userId,
      donationRowId: row.donationRowId,
      amount: row.amount,
      donationCreatedAt: row.donationCreatedAt,
      donationUpdatedAt: row.donationUpdatedAt,
      payload: row.payload,
    })),
  );
}
