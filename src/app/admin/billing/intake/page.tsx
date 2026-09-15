import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatInstant, monthLabel, timeAgo } from "@/lib/format-date";
import { Card, PageHeader, StatusChip, type ChipTone } from "@/components/ui";
import { requireBillingOps } from "../access";
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

export default async function IntakePage() {
  const gate = await requireBillingOps();
  if (!gate.ok) redirect("/admin/billing");

  const intakes = await db.invoiceIntake.findMany({
    where: { status: { not: "discarded" } },
    include: { society: { select: { name: true } }, uploadedBy: { select: { name: true, email: true } } },
    orderBy: { uploadedAt: "desc" },
    take: 200,
  });

  const rows: IntakeRow[] = intakes.map((i) => {
    const review = (i.review ?? null) as { total?: number | null; invoiceNumber?: string; paid?: string | null } | null;
    return {
      id: i.id,
      fileName: i.fileName,
      fileSize: i.fileSize,
      status: i.status,
      statusLabel: STATUS_META[i.status]?.label ?? i.status,
      statusTone: STATUS_META[i.status]?.tone ?? "neu",
      society: i.society?.name ?? null,
      period: i.period ? monthLabel(i.period) : null,
      invoiceNumber: review?.invoiceNumber ?? null,
      total: review?.total ?? null,
      uploadedAt: formatInstant(i.uploadedAt),
      uploadedAgo: timeAgo(i.uploadedAt),
      uploadedBy: i.uploadedBy.name ?? i.uploadedBy.email,
      note: i.extractionError ?? null,
      calculationId: i.monthlyCalculationId,
    };
  });

  const counts = {
    needsReview: rows.filter((r) => r.status === "needs_review" || r.status === "could_not_read" || r.status === "uploaded").length,
    ready: rows.filter((r) => r.status === "ready").length,
    submitted: rows.filter((r) => r.status === "submitted").length,
  };

  return (
    <>
      <PageHeader
        title="Invoice intake"
        subtitle="Drop this month's Zoho invoices — or the whole backfill. Each file becomes a row; confirm the row and it goes to the accountant."
        chip={counts.needsReview > 0 ? <StatusChip tone="warn">{counts.needsReview} need review</StatusChip> : undefined}
        action={
          <Link href="/admin/billing" className="btn-ghost">
            Billing board
          </Link>
        }
      />
      <IntakeClient rows={rows} counts={counts} />
      <Card className="mt-5 p-5 text-[12.5px]" >
        <p style={{ color: "var(--text-muted)" }}>
          The society and the month are always yours to confirm on the review, whatever the invoice
          says (INV-04). A submitted month reaches the society only once the accountant publishes it.
        </p>
      </Card>
    </>
  );
}
