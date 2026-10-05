// Fetching Zoho Invoice's invoices into intake (2026-09-30). A plain module,
// not "use server": the Sync button's action and the worker's 6-hourly pass
// (scripts/job-worker.ts) both call it, so a click and the timer fetch
// through the identical path.
//
// What a pass does, per invoice in Zoho (drafts and voids skipped):
// - already fetched, unchanged → nothing;
// - already fetched, changed in Zoho since → the row is marked "changed in
//   Zoho" and left alone; the operator chooses to fetch it again, because a
//   refetch replaces a review they may have worked on;
// - the same invoice number already on record (a submitted month or a retail
//   invoice) → skipped: it was entered from its PDF before this existed;
// - the same number on an intake row from a PDF upload → that row is linked
//   to Zoho, and filled from Zoho if it had not been read yet;
// - otherwise → its PDF is downloaded to storage (bytes before
//   interpretation, CON-30) and a new intake row is proposed from Zoho's own
//   figures through storeExtraction — the same review a read PDF gets.
//
// A pass fetches at most `limit` new invoices; the rest wait for the next
// pass, so a first sync of a long history stays inside Zoho's call allowance.

import { createHash } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { s3, S3_BUCKET } from "@/lib/s3";
import { runIntakeExtraction } from "@/lib/invoice-intake-extract";
import {
  getInvoice,
  getInvoicePdf,
  listInvoices,
  refreshAccessToken,
  ZohoError,
  type ZohoSession,
} from "@/lib/zoho-invoice";
import { zohoPaidProposal, zohoStatusFetched, zohoTime } from "@/lib/zoho-invoice-map";

export type ZohoSyncSummary = {
  inZoho: number;
  fetched: number;
  linked: number;
  changed: number;
  alreadyOnRecord: number;
  failed: number;
  waiting: number;
  failures: string[];
};

/** An access token that has at least two minutes left, refreshed and stored when it has not. */
export async function zohoSession(): Promise<(ZohoSession & { actorId: string | null }) | null> {
  const cfg = await db.zohoInvoiceConfig.findUnique({ where: { id: "singleton" } });
  if (!cfg || !cfg.enabled) return null;
  let accessToken = cfg.accessToken;
  if (!accessToken || !cfg.accessTokenExpiresAt || cfg.accessTokenExpiresAt.getTime() < Date.now() + 120_000) {
    const t = await refreshAccessToken({ dataCenter: cfg.dataCenter, clientId: cfg.clientId, clientSecret: cfg.clientSecret, refreshToken: cfg.refreshToken });
    accessToken = t.accessToken;
    await db.zohoInvoiceConfig.update({ where: { id: "singleton" }, data: { accessToken: t.accessToken, accessTokenExpiresAt: t.expiresAt } });
  }
  return { dataCenter: cfg.dataCenter, accessToken, organizationId: cfg.organizationId, actorId: cfg.updatedById };
}

function slug(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "invoice";
}

/** Download one Zoho invoice's PDF to the intake holding prefix. */
async function storePdf(session: ZohoSession, zohoId: string, number: string, intakeId: string) {
  const bytes = await getInvoicePdf(session, zohoId);
  const key = `Invoices/_intake/${intakeId}_zoho-${slug(number)}-${Date.now()}.pdf`;
  await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: bytes, ContentType: "application/pdf" }));
  return { key, size: bytes.length, hash: createHash("sha256").update(bytes).digest("hex") };
}

/**
 * Fetches the invoice's PDF from Zoho and runs it through the SAME read a
 * dropped file gets (2026-10-02, user-asked) — Zoho only stands in for the
 * person picking a file; everything after that, the AI read, the proposed
 * review, circuit matching, submit and release, is one flow for both. The
 * one thing a PDF genuinely can't say is answered from Zoho's own record:
 * its recorded payment status, layered onto the read review afterward.
 */
async function fillFromZoho(session: ZohoSession, intakeId: string, zohoId: string, actorId: string) {
  const inv = await getInvoice(session, zohoId);
  const pdf = await storePdf(session, zohoId, inv.invoice_number, intakeId);
  await db.invoiceIntake.update({
    where: { id: intakeId },
    data: {
      s3Key: pdf.key,
      fileSize: pdf.size,
      fileHash: pdf.hash,
      status: "reading",
      extractionError: null,
      zohoInvoiceId: zohoId,
      zohoLastModifiedAt: zohoTime(inv.last_modified_time),
      zohoChangedAt: null,
    },
  });
  const paid = zohoPaidProposal(inv);
  const r = await runIntakeExtraction(intakeId, actorId, (review) => {
    review.paid = paid.paid;
    review.paidOn = paid.paidOn;
  });
  if (r.error) throw new Error(r.error);
}

export async function runZohoSync(input: { actorId?: string | null; limit: number }): Promise<ZohoSyncSummary | null> {
  const session = await zohoSession();
  if (!session) return null;
  const actorId = input.actorId ?? session.actorId;
  const summary: ZohoSyncSummary = { inZoho: 0, fetched: 0, linked: 0, changed: 0, alreadyOnRecord: 0, failed: 0, waiting: 0, failures: [] };
  const cfg = await db.zohoInvoiceConfig.findUniqueOrThrow({ where: { id: "singleton" } });
  try {
    if (!actorId) throw new ZohoError("Nobody is recorded as having connected Zoho — reconnect it from Settings.", null);
    const importFrom = cfg.importFrom ? cfg.importFrom.toISOString().slice(0, 10) : null;
    const list = (await listInvoices(session, { dateFrom: importFrom })).filter((i) => zohoStatusFetched(i.status));
    summary.inZoho = list.length;

    const known = new Map(
      (
        await db.invoiceIntake.findMany({
          where: { zohoInvoiceId: { in: list.map((i) => i.invoice_id) } },
          select: { id: true, zohoInvoiceId: true, zohoLastModifiedAt: true, zohoChangedAt: true, status: true },
        })
      ).map((r) => [r.zohoInvoiceId!, r]),
    );
    // Still in flight — nothing committed to anything else yet, so the new
    // PDF can simply replace what's here. Zoho bumps last_modified_time on
    // ANY edit, the customer name included, so this needs no special-casing
    // for "only a small field changed" (user-asked, 2026-10-05).
    const REFETCHABLE_STATUSES = new Set(["uploaded", "reading", "needs_review", "could_not_read", "ready"]);

    for (const item of list) {
      const modified = zohoTime(item.last_modified_time);
      const mine = known.get(item.invoice_id);
      try {
        if (mine) {
          const seen = mine.zohoChangedAt ?? mine.zohoLastModifiedAt;
          if (modified && seen && modified.getTime() > seen.getTime()) {
            if (REFETCHABLE_STATUSES.has(mine.status)) {
              // Fetch the updated PDF and read it again right away — the row
              // lands back in Needs review exactly as a fresh read would,
              // which is this app's own existing way of asking someone to
              // process it (user-asked: "fetch the updated invoice pdf and
              // ask to again process... use the updated pdf everywhere").
              if (summary.fetched >= input.limit) {
                summary.waiting += 1;
              } else {
                await fillFromZoho(session, mine.id, item.invoice_id, actorId);
                summary.fetched += 1;
              }
            } else {
              // Already submitted (a billed month, a filed document, a
              // retail sale) or already discarded/refused — never silently
              // rewritten (INV-03/GATE-02). Flagged for an operator to act
              // on deliberately, same as today.
              await db.invoiceIntake.update({ where: { id: mine.id }, data: { zohoChangedAt: modified } });
            }
            summary.changed += 1;
          }
          continue;
        }
        const number = item.invoice_number.trim();
        const onRecord =
          (await db.billingInvoice.findFirst({ where: { number: { equals: number, mode: "insensitive" }, voidedAt: null }, select: { id: true } })) ??
          (await db.retailInvoice.findFirst({ where: { invoiceNumber: { equals: number, mode: "insensitive" }, voidedAt: null }, select: { id: true } }));
        const uploaded = await db.invoiceIntake.findFirst({
          where: { zohoInvoiceId: null, status: { not: "discarded" }, review: { path: ["invoiceNumber"], equals: number } },
          select: { id: true, status: true },
        });
        if (uploaded) {
          if (uploaded.status === "uploaded" || uploaded.status === "could_not_read") {
            if (summary.fetched >= input.limit) {
              summary.waiting += 1;
              continue;
            }
            await fillFromZoho(session, uploaded.id, item.invoice_id, actorId);
            summary.fetched += 1;
          } else {
            await db.invoiceIntake.update({ where: { id: uploaded.id }, data: { zohoInvoiceId: item.invoice_id, zohoLastModifiedAt: modified } });
          }
          summary.linked += 1;
          continue;
        }
        if (onRecord) {
          summary.alreadyOnRecord += 1;
          continue;
        }
        if (summary.fetched >= input.limit) {
          summary.waiting += 1;
          continue;
        }
        const row = await db.invoiceIntake.create({
          data: {
            fileName: `${number || item.invoice_id}.pdf`,
            fileSize: 0,
            s3Key: "pending",
            uploadedById: actorId,
            status: "reading",
            zohoInvoiceId: item.invoice_id,
            zohoLastModifiedAt: modified,
          },
        });
        try {
          await fillFromZoho(session, row.id, item.invoice_id, actorId);
        } catch (err) {
          // Keep the row, so the next pass does not create a second one; it
          // says what failed and can be fetched again from its own page.
          await db.invoiceIntake.update({
            where: { id: row.id },
            data: { status: "could_not_read", extractionError: `Could not be fetched from Zoho: ${err instanceof Error ? err.message : String(err)}` },
          });
          throw err;
        }
        summary.fetched += 1;
      } catch (err) {
        summary.failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        summary.failures.push(`${item.invoice_number}: ${message}`);
        logger.warn("zoho.invoice_fetch_failed", { zohoInvoiceId: item.invoice_id, number: item.invoice_number, error: message });
        // An authorisation failure fails every call after it; stop the pass.
        if (err instanceof ZohoError && (err.status === 401 || err.status === 429)) break;
      }
    }
    await db.zohoInvoiceConfig.update({
      where: { id: "singleton" },
      data: { lastSyncAt: new Date(), lastOkAt: summary.failed === 0 ? new Date() : cfg.lastOkAt, lastError: summary.failures[0] ?? null, lastSyncSummary: describeSync(summary) },
    });
    logger.info("zoho.sync_ran", { ...summary, failures: summary.failures.slice(0, 5) });
    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.zohoInvoiceConfig.update({ where: { id: "singleton" }, data: { lastSyncAt: new Date(), lastError: message } });
    logger.warn("zoho.sync_failed", { error: message });
    throw err;
  }
}

/** Re-fetch one invoice that changed in Zoho — replaces its review. */
export async function refetchZohoIntake(intakeId: string, actorId: string): Promise<void> {
  const session = await zohoSession();
  if (!session) throw new Error("Zoho is not connected.");
  const intake = await db.invoiceIntake.findUnique({ where: { id: intakeId }, select: { zohoInvoiceId: true, status: true } });
  if (!intake?.zohoInvoiceId) throw new Error("This invoice did not come from Zoho.");
  if (intake.status === "submitted") throw new Error("This invoice has already been submitted — void the month to change it.");
  await fillFromZoho(session, intakeId, intake.zohoInvoiceId, actorId);
}

/**
 * The deliberate exception to GATE-02 the accountant asked for (2026-10-06):
 * when Zoho's own copy of an ALREADY-SUBMITTED (possibly already-released)
 * invoice changes, void the live invoice and reopen the month for review —
 * requiring a fresh submit and, for a released month, a fresh release.
 * Never silent: the old invoice is voided with a stated reason naming this
 * as the cause, the old calculation is superseded rather than restated in
 * place, and both are logged. `submitIntake`'s own refusal ("already
 * released — it cannot be replaced from intake") only reads `status`, so
 * superseding the old row is what actually lets a resubmit through.
 */
export async function reprocessReleasedInvoice(intakeId: string, actorId: string): Promise<void> {
  const session = await zohoSession();
  if (!session) throw new Error("Zoho is not connected.");
  const intake = await db.invoiceIntake.findUnique({
    where: { id: intakeId },
    select: { zohoInvoiceId: true, zohoChangedAt: true, status: true, monthlyCalculationId: true },
  });
  if (!intake?.zohoInvoiceId) throw new Error("This invoice did not come from Zoho.");
  if (!intake.zohoChangedAt) throw new Error("Zoho's own copy has not changed since this was processed.");
  if (intake.status !== "submitted" || !intake.monthlyCalculationId) {
    throw new Error("This invoice is not yet submitted — fetch it again instead.");
  }
  const calc = await db.monthlyCalculation.findUnique({ where: { id: intake.monthlyCalculationId }, select: { id: true, status: true } });
  if (!calc) throw new Error("The month this was submitted to no longer exists.");

  const calcWasReleased = calc.status === "released";
  const hadLiveInvoice = await db.$transaction(async (tx) => {
    const liveInvoice = await tx.billingInvoice.findFirst({ where: { monthlyCalculationId: calc.id, voidedAt: null } });
    if (liveInvoice) {
      await tx.billingInvoice.update({
        where: { id: liveInvoice.id },
        data: {
          voidedAt: new Date(),
          voidedById: actorId,
          voidReason: "Zoho's own copy of this invoice changed after it was processed — voided to bring in the updated figures.",
        },
      });
    }
    if (calc.status !== "superseded") {
      await tx.monthlyCalculation.update({ where: { id: calc.id }, data: { status: "superseded" } });
    }
    return liveInvoice !== null;
  });
  logger.warn("billing.released_invoice_reprocessed", { actorId, intakeId, calculationId: calc.id, hadLiveInvoice, calcWasReleased });

  await fillFromZoho(session, intakeId, intake.zohoInvoiceId, actorId);
}

export function describeSync(s: ZohoSyncSummary): string {
  const parts = [`${s.fetched} fetched`];
  if (s.linked) parts.push(`${s.linked} matched to uploaded PDFs`);
  if (s.changed) parts.push(`${s.changed} changed in Zoho since fetched`);
  if (s.alreadyOnRecord) parts.push(`${s.alreadyOnRecord} already on record`);
  if (s.waiting) parts.push(`${s.waiting} waiting for the next pass`);
  if (s.failed) parts.push(`${s.failed} failed`);
  return `${parts.join(" · ")} (of ${s.inZoho} in Zoho).`;
}
