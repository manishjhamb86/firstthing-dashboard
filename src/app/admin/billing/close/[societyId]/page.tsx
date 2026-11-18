import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileText, Mail, Receipt } from "lucide-react";
import { PageHeader, StatusChip } from "@/components/ui";
import { db } from "@/lib/db";
import { formatDate, formatInstant, monthLabel } from "@/lib/format-date";
import { defaultClosePeriod, inr } from "@/lib/monthly-close";
import { loadCloseRows } from "@/lib/monthly-close-loader";
import { requireBillingReader } from "../../access";
import { BillChip, EmailChip, ReportChip, validPeriod } from "../close-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Monthly close" };

/**
 * One society's month on the close desk (2026-11-18): the three steps in
 * order — savings report, bill, email — each card stating where it stands
 * and opening its own screen. The email card opens only once both are final.
 */
export default async function CloseSocietyPage({
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
  const [row] = await loadCloseRows(period, societyId);
  if (!row) notFound();
  const q = `?period=${period}`;
  const base = `/admin/billing/close/${societyId}`;

  const [reports, emails] = await Promise.all([
    db.publishedSavingsReport.findMany({
      where: { societyId, period },
      orderBy: { publishedAt: "desc" },
      select: { id: true, version: true, publishedAt: true, voidedAt: true, circuit: { select: { location: true, lightType: true } }, publishedBy: { select: { name: true, email: true } } },
    }),
    db.monthlyCloseEmail.findMany({
      where: { societyId, period },
      orderBy: { sentAt: "desc" },
      select: { id: true, sentAt: true, recipients: true, attachments: true, sentBy: { select: { name: true, email: true } } },
    }),
  ]);
  const record = [
    ...reports.map((r) => ({ at: r.publishedAt, what: `Savings report v${r.version} (${r.circuit.location || r.circuit.lightType}) published by ${r.publishedBy.name ?? r.publishedBy.email}${r.voidedAt ? " — later withdrawn" : ""}.` })),
    ...emails.map((e) => ({ at: e.sentAt, what: `Report and invoice emailed to ${e.recipients.length} member${e.recipients.length === 1 ? "" : "s"} by ${e.sentBy.name ?? e.sentBy.email}.` })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const published = row.circuits.filter((c) => c.publishedId).length;
  const done = row.stage === "done";

  return (
    <>
      <PageHeader
        backHref={`/admin/billing/close${q}`}
        title={row.name}
        subtitle={`Monthly close · ${monthLabel(period)} · ${row.location}`}
        chip={done ? <StatusChip tone="ok">Closed for {monthLabel(period)}</StatusChip> : row.emailReady ? <StatusChip tone="info">Ready to email</StatusChip> : <StatusChip tone="neu">In progress</StatusChip>}
      />

      <ol className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <li className="card flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="lbl">Step 1</span>
            <ReportChip state={row.report} published={published} total={row.circuits.length} />
          </div>
          <h2 className="flex items-center gap-2 text-[17px] font-bold"><FileText size={18} aria-hidden /> Savings report</h2>
          <p className="text-[13.5px] text-[var(--text-muted)]">
            {row.report === "none"
              ? "No circuit has readings for this month, so there is no report to publish. The email will carry the invoice alone."
              : `${row.circuits.length} circuit${row.circuits.length === 1 ? "" : "s"} with readings this month. Review the report, then publish it to the society's portal.`}
          </p>
          {row.report !== "none" && (
            <Link href={`${base}/report${q}`} className={row.stage === "report" ? "btn-primary mt-auto" : "btn-secondary mt-auto"} style={{ textAlign: "center" }}>
              {row.report === "published" ? "View published report" : "Review & publish"}
            </Link>
          )}
        </li>

        <li className="card flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="lbl">Step 2</span>
            <BillChip state={row.bill} />
          </div>
          <h2 className="flex items-center gap-2 text-[17px] font-bold"><Receipt size={18} aria-hidden /> Monthly bill</h2>
          <p className="text-[13.5px] text-[var(--text-muted)]">
            {row.invoice
              ? `Invoice ${row.invoice.number} · ${inr(row.invoice.amount)} · due ${formatDate(row.invoice.dueDate)}.`
              : row.bill === "to_review"
                ? "The invoice has been fetched from Zoho and is waiting to be checked."
                : "The Zoho invoice for this month has not been fetched yet."}
          </p>
          <Link href={`${base}/bill${q}`} className={row.stage === "bill" ? "btn-primary mt-auto" : "btn-secondary mt-auto"} style={{ textAlign: "center" }}>
            {row.bill === "released" ? "View released bill" : row.bill === "not_fetched" ? "Fetch the bill" : "Process bill"}
          </Link>
        </li>

        <li className="card flex flex-col gap-3 p-5" style={row.stage === "email" ? { borderColor: "var(--accent)", borderWidth: 2 } : undefined}>
          <div className="flex items-center justify-between gap-2">
            <span className="lbl">Step 3</span>
            <EmailChip emailedAt={row.emailedAt} ready={row.emailReady} />
          </div>
          <h2 className="flex items-center gap-2 text-[17px] font-bold"><Mail size={18} aria-hidden /> Email both to the society</h2>
          <p className="text-[13.5px] text-[var(--text-muted)]">
            {row.emailedAt
              ? `Sent to ${row.emailedTo} member${row.emailedTo === 1 ? "" : "s"} on ${formatDate(row.emailedAt)}. You can send it again if someone needs a copy.`
              : "The savings report and the invoice go as attachments, with the standard message."}
          </p>
          {row.emailReady ? (
            <Link href={`${base}/email${q}`} className={row.stage === "email" ? "btn-primary mt-auto" : "btn-secondary mt-auto"} style={{ textAlign: "center" }}>
              {row.emailedAt ? "Send again" : "Email report & invoice"}
            </Link>
          ) : (
            <p className="mt-auto rounded-[var(--r-md)] bg-[var(--surface-sunken)] p-3 text-[13px] text-[var(--text-muted)]">
              Opens once the report is published and the bill is released.
            </p>
          )}
        </li>
      </ol>

      <section className="card mt-6 p-5">
        <h2 className="mb-3 text-[15px] font-bold">This month&apos;s record</h2>
        {record.length === 0 ? (
          <p className="text-[13.5px] text-[var(--text-muted)]">Nothing published or sent for {monthLabel(period)} yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-[13.5px]">
            {record.map((e, i) => (
              <li key={i} className="flex flex-wrap gap-x-4 gap-y-1">
                <span className="num min-w-[150px] text-[var(--text-muted)]">{formatInstant(e.at)}</span>
                <span>{e.what}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
