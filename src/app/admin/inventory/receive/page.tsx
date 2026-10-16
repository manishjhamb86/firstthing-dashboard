import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { requireInventoryPage } from "../access";
import { ReceiveForm } from "./receive-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Receive stock" };

export default async function ReceivePage({ searchParams }: { searchParams: Promise<{ upload?: string }> }) {
  await requireInventoryPage();
  const { upload } = await searchParams;
  const [suppliers, offices, items, pendingUploads] = await Promise.all([
    db.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.stockLocation.findMany({ where: { kind: "office", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.inventoryItemType.findMany({
      where: { active: true },
      select: { id: true, name: true, tracking: true, unit: true, defaultWarrantyMonths: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    // Uploaded but not yet turned into a receipt — the resume list, so an
    // interrupted upload doesn't need the exact same file re-dropped to
    // pick back up (2026-10-16, user-asked).
    db.supplierInvoiceUpload.findMany({
      where: { status: { not: "processed" } },
      orderBy: { uploadedAt: "desc" },
      take: 20,
      select: { id: true, fileName: true, status: true, uploadedAt: true, errorMessage: true },
    }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        backHref="/admin/inventory"
        title="Receive stock"
        subtitle="Record a delivery against the supplier's invoice. Each line becomes a batch with its own code; items tracked one by one get a code each, ready to print."
      />
      {suppliers.length === 0 || offices.length === 0 ? (
        <p className="text-[13.5px]" style={{ color: "var(--warn-fg)" }}>
          Add {offices.length === 0 ? "an office" : ""}
          {offices.length === 0 && suppliers.length === 0 ? " and " : ""}
          {suppliers.length === 0 ? "a supplier" : ""} first —{" "}
          <Link href="/admin/inventory/setup" className="underline">
            Offices, suppliers &amp; items
          </Link>
          .
        </p>
      ) : (
        <ReceiveForm
          suppliers={suppliers}
          offices={offices}
          items={items}
          today={today}
          pendingUploads={pendingUploads.map((u) => ({
            id: u.id,
            fileName: u.fileName,
            status: u.status,
            uploadedAt: u.uploadedAt.toISOString(),
            errorMessage: u.errorMessage,
          }))}
          resumeUploadId={upload ?? null}
        />
      )}
    </>
  );
}
