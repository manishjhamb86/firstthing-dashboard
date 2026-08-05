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

export async function saveInspectionReport(input: {
  editingId: number | null;
  societyId: number;
  reportType: string;
  reportDate: string;
  pdfUrl: string;
}) {
  await requireAdmin();

  const data = {
    societyId: input.societyId,
    reportType: input.reportType,
    reportDate: new Date(input.reportDate),
    pdfUrl: input.pdfUrl,
  };

  if (input.editingId) {
    await db.inspectionReport.update({ where: { id: input.editingId }, data });
  } else {
    await db.inspectionReport.create({ data });
  }

  revalidatePath("/admin/inspection-reports");
  revalidatePath("/inspection-reports");

  return { success: true };
}

export async function deleteInspectionReport(id: number) {
  await requireAdmin();

  await db.inspectionReport.delete({ where: { id } });

  revalidatePath("/admin/inspection-reports");
  revalidatePath("/inspection-reports");

  return { success: true };
}

export async function deleteFieldInspection(id: number) {
  await requireAdmin();

  // InspectionFormItem.form is onDelete: Cascade, so this also removes the
  // checklist items — the old Supabase version required two manual deletes.
  await db.inspectionForm.delete({ where: { id } });

  revalidatePath("/admin/inspection-reports");
  revalidatePath("/inspection-reports");

  return { success: true };
}
