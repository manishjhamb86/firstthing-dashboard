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

export async function saveReport(input: {
  editingId: number | null;
  societyId: number;
  reportMonth: string;
  pdfUrl: string;
}) {
  await requireAdmin();

  const data = {
    societyId: input.societyId,
    reportMonth: input.reportMonth,
    pdfUrl: input.pdfUrl,
  };

  if (input.editingId) {
    await db.savingsReport.update({ where: { id: input.editingId }, data });
  } else {
    await db.savingsReport.create({ data });
  }

  revalidatePath("/admin/reports");
  revalidatePath("/reports");

  return { success: true };
}

export async function deleteReport(id: number) {
  await requireAdmin();

  await db.savingsReport.delete({ where: { id } });

  revalidatePath("/admin/reports");
  revalidatePath("/reports");

  return { success: true };
}
