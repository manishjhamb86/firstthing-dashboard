"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("Unauthorized");
  }
}

export async function createTank(input: {
  societyId: number;
  tankName: string;
  tankCode: string;
  tankType: string;
  location: string;
  capacityLiters: number;
  heightMeters: number;
  sensorOffsetCm: number;
  lowAlertPercent: number;
  criticalAlertPercent: number;
  displayOrder: number;
}) {
  await requireAdmin();

  await db.tankConfiguration.create({
    data: {
      societyId: input.societyId,
      tankName: input.tankName,
      tankCode: input.tankCode,
      tankType: input.tankType,
      location: input.location,
      capacityLiters: input.capacityLiters,
      heightMeters: input.heightMeters,
      sensorOffsetCm: input.sensorOffsetCm,
      lowAlertPercent: input.lowAlertPercent,
      criticalAlertPercent: input.criticalAlertPercent,
      displayOrder: input.displayOrder,
    },
  });

  revalidatePath("/admin/tanks");

  return { success: true };
}

export async function deleteTank(id: number) {
  await requireAdmin();

  // TankReading.tank is onDelete: Cascade, so this also removes the tank's
  // readings — the old Supabase version left them orphaned.
  await db.tankConfiguration.delete({ where: { id } });

  revalidatePath("/admin/tanks");

  return { success: true };
}
