import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-permissions";
import { PageHeader } from "@/components/ui";
import { DOCUMENT_TYPES } from "@/lib/document-catalog";
import { formatDateTime, istDayHeading, istTime } from "@/lib/format-date";
import { AllDocumentsClient } from "./all-documents-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "All documents" };

/**
 * Every filed document in one list (2026-11-27, user-asked: "document
 * listing should be a separate page"). The Documents page keeps the filing
 * and the five latest; this is where anything filed is found.
 */
export default async function AllDocumentsPage() {
  await requireAdminPage();
  const docs = await db.storedDocument.findMany({
    orderBy: [{ uploadedAt: "desc" }],
    take: 2000,
    include: { society: { select: { name: true } }, uploadedBy: { select: { email: true, name: true } } },
  });
  const label = (id: string) => DOCUMENT_TYPES.find((t) => t.id === id)?.label ?? id;
  return (
    <>
      <PageHeader
        backHref="/admin/documents"
        title="All documents"
        subtitle="Everything filed against a society, newest first. A withdrawn version stays, with its reason."
        action={
          <Link href="/admin/documents" className="btn-primary">
            File a document
          </Link>
        }
      />
      <AllDocumentsClient
        rows={docs.map((d) => ({
          id: d.id,
          docType: d.docType,
          label: label(d.docType),
          version: d.version,
          society: d.society.name,
          when: d.issuedAt ? formatDateTime(d.issuedAt) : d.period,
          fileName: d.fileName,
          day: istDayHeading(d.uploadedAt),
          time: istTime(d.uploadedAt),
          by: d.uploadedBy.name ?? d.uploadedBy.email,
          withdrawn: d.voidedAt ? { reason: d.voidReason } : null,
        }))}
      />
    </>
  );
}
