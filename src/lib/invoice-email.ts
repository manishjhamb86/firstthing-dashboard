import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/ses";
import { effectiveGrants } from "@/lib/portal-access";
import { formatDate, monthLabel } from "@/lib/format-date";

/**
 * "Your invoice is ready" (2026-10-02, user-specified: email a society once
 * its invoice is released). Sent to every portal account of that society
 * holding the `billing` grant (office-bearers hold it implicitly, per
 * effectiveGrants) — the same set `/portal/billing` itself is scoped to, so
 * an email never reaches someone the portal page would refuse.
 *
 * Deliberately LINKS to the portal rather than attaching the PDF or linking
 * the S3 object directly: the invoice is stored privately and read back
 * through a short-lived presigned GET minted per viewer (getPortalInvoiceUrl)
 * — embedding one in an email would either go stale or be a standing,
 * forwardable link to a private document. The portal's own Download button
 * is the one place that link is ever minted.
 *
 * Best-effort: a release must never fail or roll back because email delivery
 * had a problem (the same rule push notifications already follow) — callers
 * fire this after the release transaction commits and only log a failure.
 */
export async function sendInvoiceReadyEmail(invoiceId: string): Promise<void> {
  const invoice = await db.billingInvoice.findUnique({
    where: { id: invoiceId },
    select: {
      number: true,
      amount: true,
      dueDate: true,
      calculation: { select: { societyId: true, period: true, society: { select: { name: true } } } },
    },
  });
  if (!invoice) return;

  const recipients = await db.profile.findMany({
    where: { societyId: invoice.calculation.societyId, isActive: true, email: { not: "" } },
    select: { email: true, name: true, portalAuthority: true, grants: true },
  });
  const to = recipients
    .filter((p) => p.portalAuthority && effectiveGrants(p.portalAuthority, p.grants).has("billing"))
    .map((p) => p.email);
  if (to.length === 0) return;

  const base = process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const portalUrl = `${base}/portal/billing`;
  const societyName = invoice.calculation.society.name;
  const period = monthLabel(invoice.calculation.period);
  const amount = `₹${invoice.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const due = formatDate(invoice.dueDate);

  const text = `Your invoice for ${period} is ready.\n\nInvoice ${invoice.number}\nAmount: ${amount}\nDue: ${due}\n\nView and download it in your FirsThing portal: ${portalUrl}\n\n— FirsThing`;
  const html = `
    <p>Your invoice for <strong>${period}</strong> is ready.</p>
    <table cellpadding="4" style="border-collapse:collapse">
      <tr><td style="color:#5A6A85">Invoice</td><td><strong>${invoice.number}</strong></td></tr>
      <tr><td style="color:#5A6A85">Amount</td><td><strong>${amount}</strong></td></tr>
      <tr><td style="color:#5A6A85">Due</td><td>${due}</td></tr>
    </table>
    <p><a href="${portalUrl}" style="color:#4560E6">View and download it in your FirsThing portal →</a></p>
    <p style="color:#6C7A93;font-size:13px">— FirsThing</p>
  `;

  const r = await sendEmail({ to, subject: `Invoice ${invoice.number} for ${societyName} — ${period}`, html, text });
  if (r.error) {
    logger.warn("email.invoice_ready_failed", { invoiceId, societyId: invoice.calculation.societyId, error: r.error });
  } else {
    logger.info("email.invoice_ready_sent", { invoiceId, societyId: invoice.calculation.societyId, recipients: to.length });
  }
}
