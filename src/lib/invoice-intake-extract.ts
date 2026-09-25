// The extraction pipeline behind SCR-094's "Read this invoice" — factored
// out of the admin action (2026-09-24) so the background sweep
// (scripts/job-worker.ts, "a backend process to read pending uploaded
// invoices itself... one by one till all read", user-asked) can call the
// EXACT same logic a person's own click would, rather than a second copy
// that could drift. No "use server" directive: a plain module, importable
// from both a Server Action and a standalone script.

import type { Prisma } from "@prisma/client";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { s3, S3_BUCKET } from "@/lib/s3";
import { extractInvoice, type ExtractedInvoice } from "@/lib/invoice-extract";
import { quotaKind } from "@/lib/gemini-models";
import {
  classifyLine,
  parseInvoiceMonth,
  proposeCircuit,
  proposeSociety,
  type CircuitOption,
  type Review,
  type ReviewLine,
} from "@/lib/invoice-intake";
import { loadInvoiceMonthContext } from "@/lib/invoice-month-loader";
import { duplicateRefuses, findDuplicateInvoice } from "@/lib/invoice-duplicate";
import { matchRetailCustomer } from "@/lib/retail-customer";

/** Invoice-first months are lighting for now — every contract on record is. */
export const INTAKE_SERVICE_LINE = "lighting" as const;

type ExtractResult = { error: string; status?: undefined } | { error?: undefined; status: string };

async function societyOptions() {
  return db.society.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
}

async function circuitOptionsFor(societyId: string): Promise<CircuitOption[]> {
  const ctx = await loadInvoiceMonthContext({ societyId, serviceLine: INTAKE_SERVICE_LINE, period: "2000-01" });
  return ctx.circuitOptions;
}

function proposeReview(x: ExtractedInvoice, societyId: string | null, circuits: CircuitOption[]): Review {
  const lines: ReviewLine[] = x.lines.map((l) => {
    const kind = classifyLine({ hsn: l.hsn, description: l.description, proposal: l.kindProposal, qty: l.qty.value });
    const proposal = kind === "service" ? proposeCircuit({ qty: l.qty.value, description: l.description }, circuits) : null;
    return {
      lineNo: l.lineNo,
      description: l.description,
      hsn: l.hsn,
      qty: l.qty.value,
      rate: l.rate.value,
      discount: l.discount.value ?? 0,
      taxPct: l.taxPct.value,
      taxAmount: l.taxAmount.value,
      amount: l.amount.value,
      kind,
      circuitId: proposal?.circuitId ?? null,
      applyCountForward: false,
      // A proposed pair arrives as a split, each circuit's share prefilled
      // with what it records — the operator confirms or corrects it.
      split: proposal?.split
        ? proposal.split.map((id) => ({
            circuitId: id,
            lights: circuits.find((c) => c.circuitId === id)?.representedLightCount ?? null,
            applyCountForward: false,
          }))
        : undefined,
    };
  });
  return {
    societyId,
    period: parseInvoiceMonth(x.invoiceForMonth.value),
    invoiceNumber: x.invoiceNumber.value,
    invoiceDate: x.invoiceDate.value,
    dueDate: x.dueDate.value,
    lines,
    subtotal: x.subtotal.value,
    taxAmount: x.taxAmount.value,
    taxPct: x.taxPct.value,
    total: x.total.value,
    // A part-paid invoice (a retail advance) prints Balance Due below Total.
    advanceAmount:
      x.total.value !== null && x.balanceDue.value !== null && x.balanceDue.value > 0 && x.balanceDue.value < x.total.value
        ? Math.round((x.total.value - x.balanceDue.value) * 100) / 100
        : null,
    advanceOn: "",
    paid: null,
    paidOn: "",
    arithmeticAcknowledgement: "",
    // A strong, checkable signal (every line classified "other"), never a
    // silent decision — the operator confirms or clears it on the review
    // screen. Correct here for the reported case: a devices/installation
    // invoice with no service line at all proposes checked; a mixed
    // invoice (a stray hardware line beside the real savings line)
    // proposes unchecked, since the invoice AS A WHOLE is still the
    // month's bill — only that one line is excluded.
    nonServiceInvoice: lines.length > 0 && lines.every((l) => l.kind === "other"),
  };
}

/** Google's rate-limit reply is a paragraph with a URL in it; the row needs a sentence. */
export function friendlyExtractionError(raw: string): string {
  if (quotaKind(raw) === "quota") {
    // Every model in the list refused (withModelFallback tried each). The
    // endpoint does not say whether that is the minute's window or the day's
    // 20-read cap on a free key, so the message covers both honestly.
    return "The document reader refused on every model it can use. Wait a minute and Retry; if it refuses again, today's free allowance (20 reads a day per model on a free key) is used up — enter the lines by hand, read it tomorrow, or move the key to a billed plan to lift the cap.";
  }
  if (/GEMINI_API_KEY/.test(raw)) return "The document reader is not configured on this server.";
  return "The invoice could not be read automatically — retry, or enter its lines by hand.";
}

/**
 * One automatic retry on a rate limit, after the delay the service asks for.
 * The free tier's window is a minute, and the reader says exactly how long to
 * wait ("retry in 49s"); the first cut capped the wait at 20 s, so a Retry
 * clicked straight after the refusal waited too little and failed the same
 * way (user-caught 2026-09-16). Honoured up to a minute now — the operator
 * sees "Reading…" for that long, which beats a second identical refusal.
 */
async function readWithOneRetry(bytes: Uint8Array): Promise<ExtractedInvoice> {
  const base64 = Buffer.from(bytes).toString("base64");
  try {
    return await extractInvoice({ base64, mimeType: "application/pdf" });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const m = raw.match(/retry in ([\d.]+)(ms|s)/i);
    if (quotaKind(raw) !== "quota" || !m) throw err;
    const waitMs = Math.min(m[2].toLowerCase() === "ms" ? Number(m[1]) : Number(m[1]) * 1000, 65_000);
    await new Promise((r) => setTimeout(r, waitMs + 1_000));
    return await extractInvoice({ base64, mimeType: "application/pdf" });
  }
}

/**
 * The whole read: fetch bytes back from S3, extract via Gemini (with one
 * rate-limit retry), propose a review, and store it — status becomes
 * `needs_review`/`could_not_read`.
 *
 * Never throws. Every step is caught and turned into a typed result,
 * including the final "propose and store" segment, which the original
 * Server Action left unguarded — a crash there (a bad DB round-trip, a
 * malformed extraction) left the row stuck at `"reading"` forever with
 * nothing to show for it, silently. The background sweep's own recurring
 * chain (ADR-006's lesson, applied here too) cannot afford an uncaught
 * rejection any more than a Server Action can afford an opaque digest.
 *
 * `actorId` is for the log line only — nothing this function writes
 * persists an actor as a foreign key, so the sweep's own synthetic id
 * ("system:invoice-intake-sweep") needs no real AdminUser row behind it.
 */
export async function runIntakeExtraction(intakeId: string, actorId: string): Promise<ExtractResult> {
  const intake = await db.invoiceIntake.findUnique({ where: { id: intakeId } });
  if (!intake) return { error: "That upload no longer exists." };
  if (intake.status === "submitted") return { error: "This invoice has already been submitted." };
  await db.invoiceIntake.update({ where: { id: intakeId }, data: { status: "reading", extractionError: null } });

  let bytes: Uint8Array;
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: intake.s3Key }));
    bytes = await obj.Body!.transformToByteArray();
  } catch {
    await db.invoiceIntake.update({
      where: { id: intakeId },
      data: { status: "could_not_read", extractionError: "The uploaded file could not be read back from storage." },
    });
    return { error: "The uploaded file could not be read back from storage. Upload it again." };
  }

  let extraction: ExtractedInvoice;
  try {
    extraction = await readWithOneRetry(bytes);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const friendly = friendlyExtractionError(raw);
    logger.warn("intake.extraction_failed", { actorId, intakeId, message: raw.slice(0, 300) });
    await db.invoiceIntake.update({ where: { id: intakeId }, data: { status: "could_not_read", extractionError: friendly } });
    return { error: friendly };
  }

  try {
    const society = proposeSociety(extraction.billToName.value, await societyOptions());
    const circuits = society ? await circuitOptionsFor(society.id) : [];
    const review = proposeReview(extraction, society?.id ?? null, circuits);
    // No society by that name, but a known retail customer? Propose the
    // retail sale with the customer chosen — the operator still confirms.
    if (!society) {
      const customers = await db.retailCustomer.findMany({ select: { id: true, nameKey: true, gstin: true } });
      const match = matchRetailCustomer({ name: extraction.billToName.value, gstin: extraction.billToGstin.value }, customers);
      if (match) {
        review.retailSale = true;
        review.retailCustomerId = match;
      }
    }
    const readable = extraction.lines.length > 0;
    const duplicate = readable
      ? await findDuplicateInvoice({ societyId: review.retailSale ? null : review.societyId, period: review.period, invoiceNumber: review.invoiceNumber, serviceLine: INTAKE_SERVICE_LINE })
      : null;
    const refused = duplicateRefuses(duplicate, review.nonServiceInvoice);
    const status = !readable ? "could_not_read" : refused ? "refused_duplicate" : "needs_review";

    await db.invoiceIntake.update({
      where: { id: intakeId },
      data: {
        extraction: extraction as unknown as Prisma.InputJsonValue,
        review: review as unknown as Prisma.InputJsonValue,
        status,
        extractionError: !readable
          ? "No line items were found on the invoice."
          : refused
            ? `Duplicate of ${duplicate!.number}${duplicate!.sameNumber ? ", already on record" : ", which already holds this society-month"}.`
            : null,
        societyId: society?.id ?? null,
        period: review.period || null,
      },
    });
    logger.info("intake.extracted", {
      actorId,
      intakeId,
      lines: extraction.lines.length,
      societyProposed: society?.id ?? null,
      periodProposed: review.period || null,
      clarifications: extraction.clarifications.length,
      duplicateOf: refused ? duplicate!.number : null,
    });
    return { status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("intake.propose_review_failed", { actorId, intakeId, error: message });
    await db.invoiceIntake.update({
      where: { id: intakeId },
      data: { status: "could_not_read", extractionError: "The document read correctly but could not be filed — retry, or enter its lines by hand." },
    });
    return { error: "The document read correctly but could not be filed — retry, or enter its lines by hand." };
  }
}
