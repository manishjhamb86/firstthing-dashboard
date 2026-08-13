"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("Unauthorized");
  }
}

export async function createEnergyStat(input: {
  societyId: number;
  todayConsumption: number;
  totalSavings: number;
  savingsPercentage: number;
  systemStatus: string;
}) {
  await requireAdmin();

  await db.energyStat.create({
    data: {
      societyId: input.societyId,
      todayConsumption: input.todayConsumption,
      totalSavings: input.totalSavings,
      savingsPercentage: input.savingsPercentage,
      systemStatus: input.systemStatus,
    },
  });

  return { success: true };
}
