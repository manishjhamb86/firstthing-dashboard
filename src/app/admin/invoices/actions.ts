"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { InvoiceStatus } from "@prisma/client";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("Unauthorized");
  }
}

export async function saveInvoice(input: {
  editingId: number | null;
  societyId: number;
  invoiceNumber: string;
  invoiceMonth: string;
  amount: number;
  gst: number;
  dueDate: string;
  status: InvoiceStatus;
  pdfUrl: string;
}) {
  await requireAdmin();

  const society = await db.society.findUnique({ where: { id: input.societyId } });
  if (!society) {
    return { success: false, error: "Society not found" };
  }

  const data = {
    societyId: input.societyId,
    societyName: society.name,
    invoiceNumber: input.invoiceNumber,
    invoiceMonth: input.invoiceMonth,
    amount: input.amount,
    gst: input.gst,
    totalAmount: input.amount + input.gst,
    dueDate: new Date(input.dueDate),
    status: input.status,
    pdfUrl: input.pdfUrl,
  };

  if (input.editingId) {
    await db.invoice.update({ where: { id: input.editingId }, data });
  } else {
    await db.invoice.create({ data });
  }

  revalidatePath("/admin/invoices");
  revalidatePath("/invoices");

  return { success: true };
}

export async function deleteInvoice(id: number) {
  await requireAdmin();

  await db.invoice.delete({ where: { id } });

  revalidatePath("/admin/invoices");
  revalidatePath("/invoices");

  return { success: true };
}
