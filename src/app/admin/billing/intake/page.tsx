import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatInstant, monthLabel, timeAgo } from "@/lib/format-date";
import { Card, PageHeader, StatusChip, type ChipTone } from "@/components/ui";
import { requireBillingOps } from "../access";
import { intakeViewOf } from "@/lib/intake-list";
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
  submitted: { label: "Submitted", tone: "neu" },
  refused_duplicate: { label: "Refused — duplicate", tone: "bad" },
  discarded: { label: "Discarded", tone: "neu" },
};

/** A read that started before this and never finished has no process behind it. */
function staleReadCutoff(): Date {
  return new Date(Date.now() - 5 * 60_000);
}

export default async function IntakePage() {
  const gate = await requireBillingOps();
  if (!gate.ok) redirect("/admin/billing");

  const intakes = await db.invoiceIntake.findMany({
    where: { status: { not: "discarded" } },
    include: { society: { select: { name: true } }, uploadedBy: { select: { name: true, email: true } } },
    orderBy: { uploadedAt: "desc" },
    take: 200,
  });

  // A read that started more than a few minutes ago and never finished has no
  // process behind it any more (the tab moved on, or the reader refused) — it
  // is unread, and the row says so rather than "Reading…" forever.
  const staleBefore = staleReadCutoff();
  const rows: IntakeRow[] = intakes.map((i) => {
    const review = (i.review ?? null) as { total?: number | null; invoiceNumber?: string; paid?: string | null } | null;
    const status = i.status === "reading" && i.uploadedAt < staleBefore ? "uploaded" : i.status;
    return {
      id: i.id,
      fileName: i.fileName,
      fileSize: i.fileSize,
      status,
      statusLabel: STATUS_META[status]?.label ?? status,
      statusTone: STATUS_META[status]?.tone ?? "neu",
      society: i.society?.name ?? null,
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
      <IntakeClient rows={rows} />
      <Card className="mt-5 p-5 text-[12.5px]" >
        <p style={{ color: "var(--text-muted)" }}>
          The society and the month are always yours to confirm on the review, whatever the invoice
          says (INV-04). A submitted month reaches the society only once the accountant publishes it.
        </p>
      </Card>
    </>
  );
}
