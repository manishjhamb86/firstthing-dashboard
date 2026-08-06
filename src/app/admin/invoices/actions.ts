"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { extractDocumentFields } from "@/lib/gemini";
import type { InvoiceStatus } from "@prisma/client";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("Unauthorized");
  }
}

type ExtractedInvoiceFields = {
  billedToName: string;
  matchedSocietyName: string;
  invoiceNumber: string;
  invoiceMonth: string;
  amount: number;
  gst: number;
  issueDate: string;
  dueDate: string;
};

export async function extractInvoiceFields(file: File) {
  await requireAdmin();

  const societies = await db.society.findMany({ select: { name: true } });
  const societyNames = societies.map((s) => s.name);

  const schema = {
    type: "object",
    properties: {
      billedToName: {
        type: "string",
        description:
          "The customer/society name exactly as written on the invoice (usually under \"Bill To\"), verbatim — regardless of whether it matches anything else. Empty string if not found.",
      },
      matchedSocietyName: {
        type: "string",
        description:
          "The EXACT name, copied verbatim, from the provided list of existing society names that best matches billedToName — even if the invoice spells it slightly differently, abbreviates it, or uses different capitalization. Empty string if none reasonably match.",
      },
      invoiceNumber: { type: "string", description: "The invoice number, empty string if not found." },
      invoiceMonth: {
        type: "string",
        description: "The invoice's billing month in YYYY-MM format, empty string if not found.",
      },
      amount: { type: "number", description: "The taxable amount before GST/tax. 0 if not found." },
      gst: { type: "number", description: "The GST/tax amount. 0 if not found." },
      issueDate: { type: "string", description: "The invoice's own issue/invoice date in YYYY-MM-DD format, empty string if not found." },
      dueDate: { type: "string", description: "The invoice due date in YYYY-MM-DD format, empty string if not found." },
    },
    required: ["billedToName", "matchedSocietyName", "invoiceNumber", "invoiceMonth", "amount", "gst", "issueDate", "dueDate"],
  };

  const prompt = `You are extracting structured data from an invoice document.

Here is the list of existing society/customer names in our system: ${JSON.stringify(societyNames)}.

Find the customer this invoice was billed to (usually under "Bill To"). Return it verbatim as "billedToName" no matter what. Separately, in "matchedSocietyName", return the exact matching string from the list above that this customer corresponds to — even if the invoice's wording differs slightly — or an empty string if none reasonably match.

Also extract the invoice number, the billing month, the taxable amount before tax, the GST/tax amount, the invoice's own issue date, and the due date. The issue date and due date are usually two separate dates — don't confuse them.`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const data = await extractDocumentFields<ExtractedInvoiceFields>({
      fileBuffer: buffer,
      mimeType: file.type || "application/pdf",
      prompt,
      schema,
    });

    return { success: true as const, data };
  } catch (err) {
    console.error("Invoice extraction failed:", err);
    return {
      success: false as const,
      error: "Could not read the invoice automatically. Please fill in the fields manually.",
    };
  }
}

export async function saveInvoice(input: {
  editingId: number | null;
  societyId: number;
  invoiceNumber: string;
  invoiceMonth: string;
  amount: number;
  gst: number;
  issueDate: string;
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
    issueDate: input.issueDate ? new Date(input.issueDate) : null,
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
