import { notFound, redirect } from "next/navigation";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/lib/db";
import { s3, S3_BUCKET } from "@/lib/s3";
import { formatInstant } from "@/lib/format-date";
import { BackButton } from "@/components/back-button";
import { INTAKE_LIST_PATH, INTAKE_LIST_RETURN_KEY } from "@/lib/intake-list";
import { PageHeader, StatusChip } from "@/components/ui";
import type { ExtractedInvoice } from "@/lib/invoice-extract";
import type { Review } from "@/lib/invoice-intake";
import { requireBillingOps } from "../../access";
import { previewIntake } from "../actions";
import { ReviewForm } from "./review-form";

// SCR-094 — Invoice review: one invoice → one society-month (CON-47 /
// FEAT-109). The PDF beside the review; every AI proposal shown next to the
// control that confirms it; the derived preview recomputed from the
// confirmed lines and never editable.

export default async function IntakeReviewPage({ params }: { params: Promise<{ intakeId: string }> }) {
  const gate = await requireBillingOps();
  if (!gate.ok) redirect("/admin/billing");
  const { intakeId } = await params;

  const intake = await db.invoiceIntake.findUnique({
    where: { id: intakeId },
    include: { uploadedBy: { select: { name: true, email: true } } },
  });
  if (!intake || intake.status === "discarded") notFound();
  if (intake.status === "submitted" && intake.monthlyCalculationId) redirect(`/admin/billing/${intake.monthlyCalculationId}`);
  // A non-service invoice (devices, a one-off charge) has no calculation to
  // land on — it was filed as a document instead. Back to the list rather
  // than re-rendering a review form for a row that is already committed.
  if (intake.status === "submitted") redirect("/admin/billing/intake");

  const societies = await db.society.findMany({ select: { id: true, name: true, location: true }, orderBy: { name: "asc" } });
  const extraction = (intake.extraction ?? null) as ExtractedInvoice | null;
  const review: Review =
    (intake.review as Review | null) ?? {
      societyId: null,
      period: "",
      invoiceNumber: "",
      invoiceDate: "",
      dueDate: "",
      lines: [],
      subtotal: null,
      taxAmount: null,
      taxPct: null,
      total: null,
      paid: null,
      paidOn: "",
      arithmeticAcknowledgement: "",
      nonServiceInvoice: false,
    };
  const preview = await previewIntake(intake.id, review);
  // The PDF is read through a signed GET, never a public URL — the Invoices/
  // prefix carries bank details and GST numbers. An hour is long enough for
  // a review; the page reloads a fresh one.
  let documentUrl: string | null = null;
  if (intake.s3Key !== "pending") {
    try {
      documentUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: intake.s3Key }), { expiresIn: 3600 });
    } catch {
      documentUrl = null;
    }
  }

  return (
    <>
      <div className="mb-4">
        <BackButton fallbackHref={INTAKE_LIST_PATH} rememberedKey={INTAKE_LIST_RETURN_KEY} />
      </div>
      <PageHeader
        title={review.invoiceNumber ? `Review invoice ${review.invoiceNumber}` : `Review ${intake.fileName}`}
        chip={
          intake.status === "uploaded" ? (
            <StatusChip tone="neu">Not read yet</StatusChip>
          ) : intake.status === "reading" ? (
            <StatusChip tone="neu">Reading…</StatusChip>
          ) : intake.status === "could_not_read" ? (
            <StatusChip tone="bad">Could not read</StatusChip>
          ) : intake.status === "ready" ? (
            <StatusChip tone="info">Ready to submit</StatusChip>
          ) : (
            <StatusChip tone="warn">Awaiting review</StatusChip>
          )
        }
        subtitle={`${intake.fileName} · ${(intake.fileSize / 1024).toFixed(0)} KB · uploaded by ${intake.uploadedBy.name ?? intake.uploadedBy.email}, ${formatInstant(intake.uploadedAt)}`}
      />
      <ReviewForm
        intakeId={intake.id}
        fileName={intake.fileName}
        documentUrl={documentUrl}
        status={intake.status}
        extraction={extraction}
        initialReview={review}
        initialPreview={preview.error ? null : (preview as Exclude<typeof preview, { error: string }>)}
        societies={societies}
      />
    </>
  );
}
