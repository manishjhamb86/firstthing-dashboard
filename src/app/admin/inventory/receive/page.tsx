import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { requireInventoryPage } from "../access";
import { ReceiveForm } from "./receive-form";
import { receivedPerLine } from "@/lib/stock-plan";
import { normaliseInvoiceNumber } from "@/lib/invoice-number";

export const dynamic = "force-dynamic";
export const metadata = { title: "Receive stock" };

export default async function ReceivePage({ searchParams }: { searchParams: Promise<{ upload?: string; pr?: string }> }) {
  await requireInventoryPage();
  const { upload, pr } = await searchParams;
  const openPrRows = await db.purchaseRequirement.findMany({
    where: { status: { in: ["sent", "partly_received"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, code: true, supplierId: true, supplier: { select: { name: true } }, lines: { select: { id: true, itemTypeId: true, quantity: true } }, batches: { select: { itemTypeId: true, quantity: true } } },
  });
  const openPrs = openPrRows.map((p) => {
    const got = new Map<string, number>();
    for (const b of p.batches) got.set(b.itemTypeId, (got.get(b.itemTypeId) ?? 0) + b.quantity);
    const per = receivedPerLine(p.lines, got);
    const remaining = new Map<string, number>();
    for (const l of p.lines) remaining.set(l.itemTypeId, (remaining.get(l.itemTypeId) ?? 0) + Math.max(0, l.quantity - (per.get(l.id) ?? 0)));
    return {
      id: p.id,
      code: p.code,
      supplierId: p.supplierId,
      supplierName: p.supplier?.name ?? null,
      remaining: [...remaining.entries()].filter(([, q]) => q > 0).map(([itemTypeId, quantity]) => ({ itemTypeId, quantity })),
    };
  });
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
      select: { id: true, fileName: true, status: true, uploadedAt: true, errorMessage: true, extraction: true },
    }),
  ]);
  // An upload whose invoice was already received — by hand, or from another
  // copy of the same PDF — is recognised by its invoice number and offered
  // as "already received" with its batches, never "Process this" (2026-11-18).
  const purchases = pendingUploads.some((u) => u.extraction)
    ? await db.inventoryPurchase.findMany({
        select: { id: true, invoiceNumber: true, createdAt: true, supplier: { select: { name: true } }, batches: { select: { id: true, code: true } } },
      })
    : [];
  const byNumber = new Map(purchases.map((p) => [normaliseInvoiceNumber(p.invoiceNumber), p]));
  const receivedAs = (extraction: unknown) => {
    const n = (extraction as { invoiceNumber?: { value?: string } } | null)?.invoiceNumber?.value ?? "";
    const p = n ? byNumber.get(normaliseInvoiceNumber(n)) : undefined;
    return p ? { purchaseId: p.id, invoiceNumber: p.invoiceNumber, supplierName: p.supplier.name, receivedOn: p.createdAt.toISOString(), batches: p.batches } : null;
  };
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
            alreadyReceived: receivedAs(u.extraction),
          }))}
          resumeUploadId={upload ?? null}
          openPrs={openPrs}
          initialPrId={pr ?? null}
        />
      )}
    </>
  );
}
