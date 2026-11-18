import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { formatInstant, monthLabel } from "@/lib/format-date";
import { defaultClosePeriod } from "@/lib/monthly-close";
import { closeRecipients } from "@/lib/monthly-close-loader";
import { closeEmailValues } from "@/lib/monthly-close-email";
import { savingsReportFileName } from "@/lib/savings-report-pdf";
import { sesConfigured } from "@/lib/ses";
import { isOps, requireBillingReader } from "../../../access";
import { validPeriod } from "../../close-ui";
import { CloseEmailComposer } from "./close-email-composer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email report and invoice — monthly close" };

/**
 * Step 3: the month's savings report and invoice, emailed to the society's
 * committee as attachments (2026-11-18). The message is the one template
 * every society gets, filled in with this month's figures; recipients come
 * only from the society's own member register.
 */
export default async function CloseEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ societyId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const gate = await requireBillingReader();
  if (!gate.ok) redirect("/admin");
  const { societyId } = await params;
  const period = validPeriod((await searchParams).period, defaultClosePeriod());
  const filled = await closeEmailValues(societyId, period);
  if (!filled) notFound();
  const { row } = filled;
  const back = `/admin/billing/close/${societyId}?period=${period}`;

  if (!row.emailReady) {
    return (
      <>
        <PageHeader backHref={back} title="Email report and invoice" subtitle={`${row.name} · ${monthLabel(period)} · step 3 of 3`} />
        <section className="card p-6">
          <p className="text-[14px]">Both documents must be final before they can be emailed: publish the savings report and release the bill first.</p>
          <Link href={back} className="btn-primary mt-4 inline-flex">Back to {row.name}</Link>
        </section>
      </>
    );
  }

  const [people, history] = await Promise.all([
    closeRecipients(societyId),
    db.monthlyCloseEmail.findMany({ where: { societyId, period }, orderBy: { sentAt: "desc" }, select: { id: true, sentAt: true, recipients: true } }),
  ]);
  const attachments = [
    ...(row.circuits.length ? [savingsReportFileName(row.name, period)] : []),
    ...(row.invoice ? [`${row.invoice.number.replace(/[^a-zA-Z0-9-]+/g, "-")}.pdf`] : []),
  ];

  return (
    <>
      <PageHeader backHref={back} title={`Email ${monthLabel(period)}'s report and invoice`} subtitle={`${row.name} · step 3 of 3`} />
      <CloseEmailComposer
        societyId={societyId}
        period={period}
        societyName={row.name}
        subject={filled.subject}
        body={filled.body}
        attachments={attachments}
        people={people}
        canSend={isOps(gate.actor)}
        emailConfigured={sesConfigured()}
        from={process.env.SES_FROM_EMAIL ?? null}
        backHref={back}
      />
      {history.length > 0 && (
        <section className="card mt-6 p-5">
          <h2 className="mb-2 text-[15px] font-bold">Sent for {monthLabel(period)}</h2>
          <ul className="flex flex-col gap-1.5 text-[13.5px]">
            {history.map((h) => (
              <li key={h.id}><span className="num text-[var(--text-muted)]">{formatInstant(h.sentAt)}</span> — {h.recipients.join(", ")}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
