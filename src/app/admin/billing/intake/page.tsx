import Link from "next/link";
import { parseIntakeFilters } from "@/lib/intake-list";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatInstant, monthLabel, timeAgo } from "@/lib/format-date";
import { Card, PageHeader, StatusChip, type ChipTone } from "@/components/ui";
import { requireBillingOps } from "../access";
import { intakeViewOf, submittedDisplayStatus } from "@/lib/intake-list";
import { CALCULATION_STATUS } from "@/lib/status-maps";
import { IntakeClient, type IntakeRow } from "./intake-client";

// SCR-093 — Invoice intake (CON-47 / FEAT-109). A dropzone and the list of
// every invoice in flight, each row saying whether the machine or a person
// is next. The per-invoice review is SCR-094 (./[intakeId]).

const STATUS_META: Record<string, { label: string; tone: ChipTone }> = {
  uploaded: { label: "Not read yet", tone: "neu" },
  reading: { label: "Reading…", tone: "neu" },
  needs_review: { label: "Needs review", tone: "warn" },
  could_not_read: { label: "Could not read", tone: "bad" },
  ready: { label: "Ready to submit", tone: "info" },
  // A submitted row's own status never moves again — what moves is the
  // month it became. These four read the linked MonthlyCalculation's own
  // status (2026-09-24, user-caught: every submitted row read as a bare
  // "Submitted" whether still awaiting release or released days ago, with
  // no way to tell which ones needed the accountant's attention).
  submitted_sent_back: CALCULATION_STATUS.sent_back,
  submitted_awaiting_release: CALCULATION_STATUS.submitted,
  submitted_released: CALCULATION_STATUS.released,
  submitted_superseded: CALCULATION_STATUS.superseded,
  // Fallback for the (should-not-happen) case of a submitted row whose
  // calculation link is missing.
  submitted: { label: "Submitted", tone: "neu" },
  // A real, separate non-service bill (2026-09-24) — filed as a document,
  // never a month of record, so it has no calculation to read a status from.
  submitted_filed_document: { label: "Filed — not yet with the society", tone: "info" },
  // Filed, then released onto the society's portal (2026-09-25).
  submitted_filed_released: { label: "Filed · released to society", tone: "ok" },
  // A retail sale (2026-09-25) — filed against a retail customer.
  submitted_retail: { label: "Filed · retail sale", tone: "info" },
  refused_duplicate: { label: "Refused — duplicate", tone: "bad" },
  discarded: { label: "Discarded", tone: "neu" },
};

/** A read that started before this and never finished has no process behind it. */
function staleReadCutoff(): Date {
  return new Date(Date.now() - 5 * 60_000);
}

export default async function IntakePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseIntakeFilters(await searchParams);
  const gate = await requireBillingOps();
  if (!gate.ok) redirect("/admin/billing");

  const intakes = await db.invoiceIntake.findMany({
    where: { status: { not: "discarded" } },
    include: { society: { select: { name: true } }, uploadedBy: { select: { name: true, email: true } } },
    orderBy: { uploadedAt: "desc" },
    take: 200,
  });

  // No declared Prisma relation from InvoiceIntake to MonthlyCalculation
  // (monthlyCalculationId is a plain scalar column) — one batched lookup
  // rather than adding one, so this stays a read-only, no-schema-change fix.
  const calcIds = [...new Set(intakes.filter((i) => i.status === "submitted" && i.monthlyCalculationId).map((i) => i.monthlyCalculationId!))];
  const calcs = calcIds.length
    ? await db.monthlyCalculation.findMany({ where: { id: { in: calcIds } }, select: { id: true, status: true } })
    : [];
  const calcStatusById = new Map(calcs.map((c) => [c.id, c.status]));
  const retailIds = intakes.filter((i) => i.retailInvoiceId).map((i) => i.retailInvoiceId!);
  const retailCustomerByInvoice = new Map(
    (retailIds.length ? await db.retailInvoice.findMany({ where: { id: { in: retailIds } }, select: { id: true, customerId: true, customer: { select: { name: true } } } }) : []).map((r) => [
      r.id,
      r.customerId,
    ]),
  );
  // A retail row shows its customer's name where a society would sit.
  const retailNameByInvoice = new Map(
    retailIds.length
      ? (await db.retailInvoice.findMany({ where: { id: { in: retailIds } }, select: { id: true, customer: { select: { name: true } } } })).map((r) => [r.id, r.customer.name])
      : [],
  );
  const docIds = intakes.filter((i) => i.filedAsDocumentId).map((i) => i.filedAsDocumentId!);
  const releasedDocIds = new Set(
    docIds.length
      ? (await db.storedDocument.findMany({ where: { id: { in: docIds }, releasedToSocietyAt: { not: null } }, select: { id: true } })).map((d) => d.id)
      : [],
  );

  // A read that started more than a few minutes ago and never finished has no
  // process behind it any more (the tab moved on, or the reader refused) — it
  // is unread, and the row says so rather than "Reading…" forever.
  const staleBefore = staleReadCutoff();
  const rows: IntakeRow[] = intakes.map((i) => {
    const review = (i.review ?? null) as {
      total?: number | null;
      invoiceNumber?: string;
      paid?: string | null;
      societyId?: string | null;
      period?: string;
    } | null;
    let status: string = i.status === "reading" && i.uploadedAt < staleBefore ? "uploaded" : i.status;
    if (status === "submitted" && i.retailInvoiceId) {
      status = "submitted_retail";
    } else if (status === "submitted" && i.filedAsDocumentId) {
      status = releasedDocIds.has(i.filedAsDocumentId) ? "submitted_filed_released" : "submitted_filed_document";
    } else if (status === "submitted") {
      const calcStatus = i.monthlyCalculationId ? calcStatusById.get(i.monthlyCalculationId) : undefined;
      status = submittedDisplayStatus(calcStatus);
    }
    return {
      id: i.id,
      fileName: i.fileName,
      fileSize: i.fileSize,
      status,
      statusLabel: STATUS_META[status]?.label ?? status,
      statusTone: STATUS_META[status]?.tone ?? "neu",
      society: i.society?.name ?? (i.retailInvoiceId ? `${retailNameByInvoice.get(i.retailInvoiceId) ?? "Retail customer"} (retail)` : null),
      periodKey: i.period ?? null,
      period: i.period ? monthLabel(i.period) : null,
      invoiceNumber: review?.invoiceNumber ?? null,
      total: review?.total ?? null,
      uploadedAt: formatInstant(i.uploadedAt),
      uploadedAtMs: i.uploadedAt.getTime(),
      uploadedAgo: timeAgo(i.uploadedAt),
      uploadedBy: i.uploadedBy.name ?? i.uploadedBy.email,
      note: i.extractionError ?? null,
      calculationId: i.monthlyCalculationId,
      // Only set for a non-service invoice's row — where it was filed
      // instead of submitted as a calculation.
      filedSocietyId: i.filedAsDocumentId ? i.societyId : null,
      retailCustomerId: i.retailInvoiceId ? (retailCustomerByInvoice.get(i.retailInvoiceId) ?? null) : null,
      // What the bulk bar's rule reads (src/lib/intake-bulk.ts) — the
      // review's own confirmed values, the same ones the server re-checks.
      hasSociety: !!review?.societyId,
      hasPeriod: !!review?.period && /^\d{4}-\d{2}$/.test(review.period),
    };
  });

  // The header's count reads the same rule as the chips (src/lib/intake-list).
  const needsReview = rows.filter((r) => intakeViewOf(r.status) === "review").length;

  return (
    <>
      <PageHeader
        title="Invoice intake"
        subtitle="Drop this month's Zoho invoices — or the whole backfill. Each file becomes a row; confirm the row and it goes to the accountant."
        chip={needsReview > 0 ? <StatusChip tone="warn">{needsReview} need review</StatusChip> : undefined}
        action={
          <Link href="/admin/billing" className="btn-ghost">
            Billing board
          </Link>
        }
      />
      <IntakeClient rows={rows} initialFilters={filters} canRelease={gate.actor.permissions.includes("release_billing")} />
      <Card className="mt-5 p-5 text-[12.5px]" >
        <p style={{ color: "var(--text-muted)" }}>
          The society and the month are always yours to confirm on the review, whatever the invoice
          says (INV-04). A submitted month reaches the society only once the accountant publishes it.
        </p>
      </Card>
    </>
  );
}
