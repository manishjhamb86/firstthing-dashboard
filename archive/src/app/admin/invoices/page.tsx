import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import InvoicesClient from "./invoices-client";

export default async function AdminInvoicesPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const [societies, invoices] = await Promise.all([
    db.society.findMany({ orderBy: { name: "asc" } }),
    db.invoice.findMany({ orderBy: { id: "desc" } }),
  ]);

  return (
    <InvoicesClient
      societies={societies.map((s) => ({ id: s.id, name: s.name }))}
      invoices={invoices.map((invoice) => ({
        id: invoice.id.toString(),
        societyId: invoice.societyId,
        societyName: invoice.societyName ?? "",
        invoiceNumber: invoice.invoiceNumber,
        invoiceMonth: invoice.invoiceMonth ?? "",
        amount: invoice.amount ? invoice.amount.toNumber() : 0,
        gst: invoice.gst ? invoice.gst.toNumber() : 0,
        totalAmount: invoice.totalAmount ? invoice.totalAmount.toNumber() : 0,
        issueDate: invoice.issueDate ? invoice.issueDate.toISOString().slice(0, 10) : "",
        dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : "",
        status: invoice.status,
        pdfUrl: invoice.pdfUrl ?? "",
      }))}
    />
  );
}
