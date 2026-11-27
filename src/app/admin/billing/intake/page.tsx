import Link from "next/link";
import { parseIntakeFilters } from "@/lib/intake-list";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatInstant, monthLabel, timeAgo } from "@/lib/format-date";
import { Card, PageHeader, StatusChip, type ChipTone } from "@/components/ui";
import { requireBillingOps } from "../access";
import { daysPastDue, submittedDisplayStatus } from "@/lib/intake-list";
import { CALCULATION_STATUS } from "@/lib/status-maps";
import { retailInvoiceSettled } from "@/lib/retail-customer";
import { IntakeClient, type IntakeRow } from "./intake-client";
import { ZohoFetchButton } from "./zoho-fetch-button";

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

// A shorter word for this one narrow, table-layout:fixed column (2026-10-15)
// — the shared BILLING_INVOICE_STATUS wording ("Attached — not yet
// released", "Overdue — warning stage") is right on the invoice's own
// detail page, which has the room; forcing those full sentences into this
// column pushed Month/Total into visibly overlapping each other (user-
// reported, screenshot). "warning" keeps the SAME red emphasis as plain
// "overdue" here — the finer distinction is what the detail page is for.
const PAYMENT_STATUS_COMPACT: Record<string, { label: string; tone: ChipTone }> = {
  // attached: no chip — the stage chip beside it already says "Awaiting release".
  released: { label: "Unpaid", tone: "warn" },
  overdue: { label: "Overdue", tone: "bad" },
  warning: { label: "Overdue", tone: "bad" },
  suspended: { label: "Suspended", tone: "bad" },
  paid: { label: "Paid", tone: "ok" },
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
  if (!gate.ok) redirect("/admin");

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
  // Payment status (2026-10-15, user-asked: "show payment status of each
  // invoice on listing"): the LIVE BillingInvoice per calculation — the same
  // CON-13-sweep-maintained status the invoice detail panel itself displays,
  // never recomputed here with different logic. voidedAt: null — a voided
  // attach (2026-09-12's void/reattach) is history, not the live bill.
  const liveInvoices = calcIds.length
    ? await db.billingInvoice.findMany({
        where: { monthlyCalculationId: { in: calcIds }, voidedAt: null },
        select: { monthlyCalculationId: true, status: true, dueDate: true },
      })
    : [];
  const paymentStatusByCalc = new Map(liveInvoices.map((inv) => [inv.monthlyCalculationId, inv.status]));
  const dueByCalc = new Map(liveInvoices.map((inv) => [inv.monthlyCalculationId, inv.dueDate.toISOString().slice(0, 10)]));
  const today = new Date();
  const retailIds = intakes.filter((i) => i.retailInvoiceId).map((i) => i.retailInvoiceId!);
  const retailInvoices = retailIds.length
    ? await db.retailInvoice.findMany({
        where: { id: { in: retailIds } },
        select: {
          id: true,
          customerId: true,
          customer: { select: { name: true } },
          total: true,
          advanceAmount: true,
          payments: { select: { amount: true } },
        },
      })
    : [];
  const retailCustomerByInvoice = new Map(retailInvoices.map((r) => [r.id, r.customerId]));
  // A retail row shows its customer's name where a society would sit.
  const retailNameByInvoice = new Map(retailInvoices.map((r) => [r.id, r.customer.name]));
  // Retail has no CON-13 arrears clock (retail-customer.ts's own comment) —
  // just whether the money owed has actually arrived.
  const retailSettledByInvoice = new Map(
    retailInvoices.map((r) => [r.id, retailInvoiceSettled(r, r.payments)]),
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
      dueDate?: string | null;
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
    const dueDate =
      (i.monthlyCalculationId ? dueByCalc.get(i.monthlyCalculationId) : undefined) ??
      (review?.dueDate && /^\d{4}-\d{2}-\d{2}/.test(review.dueDate) ? review.dueDate.slice(0, 10) : null);
    const liveStatus = i.monthlyCalculationId ? paymentStatusByCalc.get(i.monthlyCalculationId) : undefined;
    const compact = liveStatus ? PAYMENT_STATUS_COMPACT[liveStatus] : undefined;
    const lateDays = compact?.tone === "bad" ? daysPastDue(dueDate, today) : 0;
    return {
      id: i.id,
      dueDate,
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
      // A submitted invoice has nothing left to read: an old reader error must not sit beside "Released".
      note: i.status === "submitted" ? null : (i.extractionError ?? null),
      calculationId: i.monthlyCalculationId,
      // The actual filed StoredDocument's own id — "View document" opens
      // THIS document (2026-10-02, user-caught: the link only carried the
      // society, landing on the generic upload page with the file nowhere
      // in sight rather than on the document that was actually filed).
      filedDocumentId: i.filedAsDocumentId ?? null,
      retailCustomerId: i.retailInvoiceId ? (retailCustomerByInvoice.get(i.retailInvoiceId) ?? null) : null,
      // What the bulk bar's rule reads (src/lib/intake-bulk.ts) — the
      // review's own confirmed values, the same ones the server re-checks.
      hasSociety: !!review?.societyId,
      hasPeriod: !!review?.period && /^\d{4}-\d{2}$/.test(review.period),
      fromZoho: i.zohoInvoiceId !== null,
      // Shown for a submitted row too now (2026-10-05, user-asked) — it was
      // previously suppressed there, which meant a change Zoho recorded
      // against an already-billed month produced no visible signal anywhere
      // at all. A still-in-flight row never reaches here with the flag set:
      // the sync itself refetches and re-reads it immediately.
      zohoChanged: i.zohoChangedAt !== null,
      // Payment status (2026-10-15, user-asked) — null reads as "—", a
      // filed document copy or a not-yet-submitted row has no payment
      // lifecycle to show. Service-line bills read CON-13's own stored
      // status (overdue/warning/suspended all ring red, via
      // PAYMENT_STATUS_COMPACT above); a retail sale has no arrears clock,
      // so it's simply Paid or Unpaid.
      paymentStatus: i.retailInvoiceId
        ? { label: retailSettledByInvoice.get(i.retailInvoiceId) ? "Paid" : "Unpaid", tone: retailSettledByInvoice.get(i.retailInvoiceId) ? "ok" : "warn" }
        : compact
          ? lateDays > 0 && liveStatus !== "suspended"
            ? { label: `Unpaid · ${lateDays} day${lateDays === 1 ? "" : "s"} overdue`, tone: "bad" }
            : compact
          : null,
    };
  });

  const zoho = await db.zohoInvoiceConfig.findUnique({ where: { id: "singleton" }, select: { enabled: true, lastSyncAt: true, lastSyncSummary: true, lastError: true } });

  return (
    <>
      <PageHeader
        title="Invoice intake"
        subtitle={
          zoho?.enabled ? (
            <span className="flex flex-wrap items-center gap-2">
              <StatusChip tone={zoho.lastError ? "bad" : "ok"}>{zoho.lastError ? "Zoho fetch failed" : "Zoho connected"}</StatusChip>
              <span style={{ color: zoho.lastError ? "var(--bad-fg)" : undefined }}>
                {zoho.lastSyncAt ? `Last fetched ${timeAgo(zoho.lastSyncAt)}` : "Not fetched yet"}
                {zoho.lastError || zoho.lastSyncSummary ? ` · ${zoho.lastError ?? zoho.lastSyncSummary}` : ""}
              </span>
            </span>
          ) : (
            "Drop this month's invoices, confirm each row, and it goes to the accountant."
          )
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/billing/close" className="btn-ghost">
              Monthly close →
            </Link>
            {zoho?.enabled && <ZohoFetchButton />}
          </div>
        }
      />
      <IntakeClient rows={rows} initialFilters={filters} canRelease={gate.actor.permissions.includes("release_billing")} />
      <Card className="mt-5 p-5 text-[12.5px]" >
        <p style={{ color: "var(--text-muted)" }}>
          The society and the month are always yours to confirm on the review, whatever the invoice
          says. A submitted month reaches the society only once the accountant publishes it.
        </p>
      </Card>
    </>
  );
}
