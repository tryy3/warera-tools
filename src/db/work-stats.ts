import type { CompanyWorkDay, WorkerWorkDay } from "../warera/work-stats";
import type { Db } from "./client";
import { companyWorkStats, workerWorkStats } from "./schema";

export async function upsertCompanyWorkDays(
  db: Db,
  companyId: string,
  days: CompanyWorkDay[],
  fetchedAt: Date,
): Promise<number> {
  if (days.length === 0) return 0;

  for (const day of days) {
    await db
      .insert(companyWorkStats)
      .values({
        companyId,
        dailyDate: day.dailyDate,
        automatedEngine: day.automatedEngine,
        employeeProd: day.employeeProd,
        selfWork: day.selfWork,
        total: day.total,
        wage: day.wage,
        payload: day.payload,
        fetchedAt,
      })
      .onConflictDoUpdate({
        target: [companyWorkStats.companyId, companyWorkStats.dailyDate],
        set: {
          automatedEngine: day.automatedEngine,
          employeeProd: day.employeeProd,
          selfWork: day.selfWork,
          total: day.total,
          wage: day.wage,
          payload: day.payload,
          fetchedAt,
        },
      });
  }

  return days.length;
}

export async function upsertWorkerWorkDays(
  db: Db,
  target: { companyId: string; workerId: string },
  days: WorkerWorkDay[],
  fetchedAt: Date,
): Promise<number> {
  if (days.length === 0) return 0;

  for (const day of days) {
    await db
      .insert(workerWorkStats)
      .values({
        companyId: target.companyId,
        workerId: target.workerId,
        dailyDate: day.dailyDate,
        employeeProd: day.employeeProd,
        total: day.total,
        wage: day.wage,
        payload: day.payload,
        fetchedAt,
      })
      .onConflictDoUpdate({
        target: [
          workerWorkStats.companyId,
          workerWorkStats.workerId,
          workerWorkStats.dailyDate,
        ],
        set: {
          employeeProd: day.employeeProd,
          total: day.total,
          wage: day.wage,
          payload: day.payload,
          fetchedAt,
        },
      });
  }

  return days.length;
}
