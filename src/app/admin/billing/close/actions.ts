"use server";

import { revalidatePath } from "next/cache";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { s3, S3_BUCKET } from "@/lib/s3";
import { emailBlockedReason, sendEmail } from "@/lib/ses";
import { runZohoSync, describeSync } from "@/lib/zoho-invoice-sync";
import { requireBillingOps } from "../access";
import { publishSavingsReport } from "@/app/admin/societies/[id]/circuits/[circuitId]/reports/monthly/actions";
import type { SavingsReportSnapshot } from "@/app/admin/societies/[id]/circuits/[circuitId]/reports/report-data";
import { loadCloseRows } from "@/lib/monthly-close-loader";
import { closeEmailValues } from "@/lib/monthly-close-email";
import { buildSavingsReportPdf, savingsReportFileName } from "@/lib/savings-report-pdf";
import {
  cleanRecipients, MONTHLY_CLOSE_TEMPLATE_KEY, refuseTemplate, textToHtml,
} from "@/lib/monthly-close";

/**
 * The monthly close desk's acts (2026-11-18). Each reuses the act that
 * already owns it — publishing a circuit's report, the Zoho fetch — so the
 * desk is one more door to the same decisions, never a second set of rules.
 * Every refusal is a typed error and a log line.
 */

const PERIOD_RE = /^\d{4}-\d{2}$/;
const closePath = (societyId?: string) => (societyId ? `/admin/billing/close/${societyId}` : "/admin/billing/close");

/** Publish every circuit's savings report for the month in one go — each through the circuit's own publish. */
export async function publishMonthReports(societyId: string, period: string): Promise<{ error?: string; published?: number; already?: number }> {
  if (!PERIOD_RE.test(period)) return { error: "Choose a month first." };
  const [row] = await loadCloseRows(period, societyId);
  if (!row) return { error: "That society is not billing this month." };
  if (row.circuits.length === 0) return { error: "No circuit has readings for this month — there is no report to publish." };
  let published = 0;
  let already = 0;
  const problems: string[] = [];
  for (const c of row.circuits) {
    const r = await publishSavingsReport(c.id, period);
    if ("version" in r) published += 1;
    else if (/Already published/.test(r.error)) already += 1;
    else problems.push(`${c.label}: ${r.error}`);
  }
  revalidatePath(closePath(societyId));
  revalidatePath(closePath());
  if (problems.length) return { error: problems.join(" "), published, already };
  return { published, already };
}

/** Fetch new invoices from Zoho now, then say whether this society's month arrived. */
export async function fetchBillFromZoho(societyId: string, period: string): Promise<{ error?: string; summary?: string; found?: boolean }> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  if (!PERIOD_RE.test(period)) return { error: "Choose a month first." };
  try {
    const r = await runZohoSync({ actorId: ops.actor.id, limit: 25 });
    if (!r) return { error: "Zoho is not connected, or its fetch is paused — see Settings → Zoho Invoice." };
    const [row] = await loadCloseRows(period, societyId);
    const found = !!row && row.bill !== "not_fetched";
    logger.info("monthly_close.zoho_fetched", { actorId: ops.actor.id, societyId, period, fetched: r.fetched, found });
    revalidatePath(closePath(societyId));
    revalidatePath(closePath());
    return { summary: describeSync(r), found };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** The template — the same message for every society. */
export async function saveMonthlyCloseTemplate(subject: string, body: string): Promise<{ error?: string }> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  const refusal = refuseTemplate(subject, body);
  if (refusal) {
    logger.warn("monthly_close.template_refused", { actorId: ops.actor.id, reason: refusal });
    return { error: refusal };
  }
  await db.messageTemplate.upsert({
    where: { key: MONTHLY_CLOSE_TEMPLATE_KEY },
    create: { key: MONTHLY_CLOSE_TEMPLATE_KEY, subject: subject.trim(), body: body.trim(), updatedById: ops.actor.id },
    update: { subject: subject.trim(), body: body.trim(), updatedById: ops.actor.id },
  });
  logger.info("monthly_close.template_saved", { actorId: ops.actor.id });
  revalidatePath("/admin/settings/monthly-email");
  return {};
}

async function s3Bytes(key: string): Promise<Uint8Array> {
  const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  return obj.Body!.transformToByteArray();
}

/** Send the month's savings report and invoice to the chosen members, both attached. */
export async function sendCloseEmail(input: { societyId: string; period: string; recipients: string[] }): Promise<{ error?: string; sentTo?: number }> {
  const ops = await requireBillingOps();
  if (!ops.ok) return { error: ops.error };
  if (!PERIOD_RE.test(input.period)) return { error: "Choose a month first." };
  const blocked = emailBlockedReason();
  if (blocked) {
    logger.warn("monthly_close.email_refused", { actorId: ops.actor.id, societyId: input.societyId, period: input.period, reason: "email_blocked_here" });
    return { error: blocked };
  }
  const to = cleanRecipients(input.recipients);
  if (to.length === 0) return { error: "Choose at least one person to send it to." };

  const filled = await closeEmailValues(input.societyId, input.period);
  if (!filled) return { error: "That society is not billing this month." };
  const { row } = filled;
  if (!row.emailReady) {
    logger.warn("monthly_close.email_refused", { actorId: ops.actor.id, societyId: input.societyId, period: input.period, reason: "not_ready", report: row.report, bill: row.bill });
    return { error: "Both the savings report and the bill must be published before they can be emailed." };
  }
  // Only addresses on the society's own member register — never a typed one.
  const allowed = new Set(
    (await db.societyMember.findMany({ where: { societyId: input.societyId, endedOn: null, email: { not: null } }, select: { email: true } }))
      .map((m) => m.email!.trim().toLowerCase()),
  );
  const strays = to.filter((e) => !allowed.has(e));
  if (strays.length) {
    logger.warn("monthly_close.email_refused", { actorId: ops.actor.id, societyId: input.societyId, reason: "not_a_member", strays: strays.length });
    return { error: "Every recipient must be a current member of the society's register with that email." };
  }

  const reportIds = row.circuits.map((c) => c.publishedId).filter((x): x is string => !!x);
  const attachments: { fileName: string; contentType: string; bytes: Uint8Array }[] = [];
  try {
    if (reportIds.length) {
      const reports = await db.publishedSavingsReport.findMany({ where: { id: { in: reportIds } }, select: { snapshot: true } });
      attachments.push({
        fileName: savingsReportFileName(row.name, input.period),
        contentType: "application/pdf",
        bytes: await buildSavingsReportPdf(reports.map((r) => r.snapshot as unknown as SavingsReportSnapshot)),
      });
    }
    if (row.invoice) {
      const inv = await db.billingInvoice.findUnique({ where: { id: row.invoice.id }, select: { s3Key: true, number: true } });
      if (inv) attachments.push({ fileName: `${inv.number.replace(/[^a-zA-Z0-9-]+/g, "-")}.pdf`, contentType: "application/pdf", bytes: await s3Bytes(inv.s3Key) });
    }
  } catch (err) {
    logger.error("monthly_close.attachment_failed", { societyId: input.societyId, period: input.period, error: err instanceof Error ? err.message : String(err) });
    return { error: "Could not prepare the attachments — the invoice PDF could not be read. Try again in a moment." };
  }

  const sent = await sendEmail({ to, subject: filled.subject, text: filled.body, html: textToHtml(filled.body), attachments });
  if (sent.error) {
    logger.warn("monthly_close.email_failed", { actorId: ops.actor.id, societyId: input.societyId, period: input.period, error: sent.error });
    return { error: `The email was not sent: ${sent.error}` };
  }
  await db.monthlyCloseEmail.create({
    data: {
      societyId: input.societyId,
      period: input.period,
      recipients: to,
      subject: filled.subject,
      body: filled.body,
      attachments: attachments.map((a) => a.fileName),
      billingInvoiceId: row.invoice?.id ?? null,
      reportIds,
      sentById: ops.actor.id,
    },
  });
  logger.info("monthly_close.email_sent", { actorId: ops.actor.id, societyId: input.societyId, period: input.period, recipients: to.length, attachments: attachments.length, messageId: sent.messageId });
  revalidatePath(closePath(input.societyId));
  revalidatePath(closePath());
  return { sentTo: to.length };
}
