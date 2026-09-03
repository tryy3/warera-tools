import type { Db } from "./client";
import { donationPolls, donationSnapshots } from "./schema";

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
