import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { PageHeader, PageRibbon, StatusChip } from "@/components/ui";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, formatInstant, monthLabel } from "@/lib/format-date";
import { publicS3Url } from "@/lib/s3";
import { INTEREST_LABEL, PURPOSE_LABEL, locationWords, monthVisitState } from "@/lib/customer-visits";
import { VisitForm } from "../visit-form";
import { VisitStatusChip } from "../visit-ui";
import { NextReviewLink, ReviewPanel, WithdrawVisit } from "./review-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visit" };

export default async function VisitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; saved?: string }> }) {
  await requireAdminPage();
  const actor = await resolveAdmin();
  const { id } = await params;
  const { edit, saved } = await searchParams;
  const visit = await db.customerVisit.findUnique({
    where: { id },
    include: {
      society: { select: { id: true, name: true } },
      loggedBy: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { name: true, email: true } },
      voidedBy: { select: { name: true, email: true } },
    },
  });
  if (!visit || !actor) notFound();
  const logger = visit.loggedBy.name ?? visit.loggedBy.email;
  const mine = visit.loggedBy.id === actor.id;
  const editable = mine && !visit.voidedAt && visit.status !== "approved";
  const canApprove = actor.permissions.includes("approve_visits") && !mine;

  if (edit === "1" && editable) {
    const societies = await db.society.findMany({ where: { status: { not: "terminated" } }, orderBy: { name: "asc" }, select: { id: true, name: true, location: true } });
    return (
      <>
        <PageHeader backHref={`/admin/visits/${id}`} title={`Correct the visit — ${visit.society.name}`} />
        <VisitForm
          visitId={id}
          sentBackNote={visit.status === "sent_back" ? visit.reviewNote : null}
          societies={societies.map((s) => ({ id: s.id, label: s.name, sublabel: s.location }))}
          initial={{
            societyId: visit.societyId,
            visitedAt: visit.visitedAt.toISOString().slice(0, 16),
            purpose: visit.purpose,
            agenda: visit.agenda,
            outcome: visit.outcome,
            metName: visit.metName ?? "",
            metRole: visit.metRole ?? "",
            rating: visit.rating,
            interests: visit.interests,
            followUps: visit.followUps ?? "",
            photoKeys: visit.photoKeys,
            photoUrls: Object.fromEntries(visit.photoKeys.map((k) => [k, publicS3Url(k)])),
          }}
        />
      </>
    );
  }

  const monthVisits = await db.customerVisit.findMany({
    where: { societyId: visit.societyId, period: visit.period, voidedAt: null },
    orderBy: { visitedAt: "asc" },
    select: { id: true, purpose: true, status: true, visitedAt: true },
  });
  const monthState = monthVisitState(monthVisits.map((v) => ({ purpose: v.purpose, status: v.status, voided: false })));
  const loc = locationWords(visit.distanceM, visit.latitude !== null);

  return (
    <>
      {saved === "1" && !visit.voidedAt && <PageRibbon tone="ok">Visit saved. It counts once someone else approves it.</PageRibbon>}
      {visit.voidedAt && (
        <PageRibbon tone="neutral">
          Withdrawn {formatInstant(visit.voidedAt)} by {visit.voidedBy?.name ?? visit.voidedBy?.email ?? "—"}: {visit.voidReason}. Kept on record; it does not count.
        </PageRibbon>
      )}
      <PageHeader
        backHref="/admin/visits"
        title={visit.society.name}
        subtitle={`${formatDateTime(visit.visitedAt)} · logged by ${logger} on ${formatInstant(visit.loggedAt)}`}
        chip={
          <span className="flex flex-wrap gap-2">
            <StatusChip tone={visit.purpose === "feedback_upsell" ? "info" : "neu"}>{PURPOSE_LABEL[visit.purpose]}</StatusChip>
            <VisitStatusChip status={visit.status} voided={!!visit.voidedAt} />
          </span>
        }
        action={editable ? <Link href={`/admin/visits/${id}?edit=1`} className="btn-secondary">{visit.status === "sent_back" ? "Correct and resend" : "Edit"}</Link> : undefined}
      />

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-col gap-4" style={{ flex: "999 1 520px" }}>
          {visit.status === "sent_back" && visit.reviewNote && !visit.voidedAt && (
            <p className="card p-4 text-[14px]" style={{ background: "var(--bad-bg)", color: "var(--bad-fg)", borderColor: "var(--bad-line)" }}>
              Sent back by {visit.reviewedBy?.name ?? visit.reviewedBy?.email}: “{visit.reviewNote}”{mine ? " — correct it and resend." : ""}
            </p>
          )}
          <section className="card flex flex-col gap-4 p-5">
            <div>
              <h2 className="lbl mb-1">Agenda</h2>
              <p className="whitespace-pre-line text-[14.5px]">{visit.agenda}</p>
            </div>
            <div>
              <h2 className="lbl mb-1">What happened</h2>
              <p className="whitespace-pre-line text-[14.5px]">{visit.outcome}</p>
            </div>
            <dl className="grid gap-4 text-[13px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
              <div><dt className="text-[var(--text-muted)]">Met</dt><dd className="mt-1 font-semibold">{visit.metName ? `${visit.metName}${visit.metRole ? ` · ${visit.metRole}` : ""}` : "—"}</dd></div>
              {visit.rating !== null && <div><dt className="text-[var(--text-muted)]">Feedback</dt><dd className="mt-1 font-semibold">{visit.rating} of 5</dd></div>}
              <div>
                <dt className="text-[var(--text-muted)]">Location</dt>
                <dd className="mt-1 font-semibold" style={loc.atSociety === false ? { color: "var(--warn-fg)" } : undefined}>{loc.text}</dd>
              </div>
            </dl>
          </section>
          {visit.purpose === "feedback_upsell" && (
            <section className="card p-5">
              <h2 className="mb-2 text-[15px] font-bold">Upselling</h2>
              {visit.interests.length === 0 ? (
                <p className="text-[13.5px] text-[var(--text-muted)]">No interest in other services this time.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {visit.interests.map((i) => (
                    <li key={i}><StatusChip tone="ok">{INTEREST_LABEL[i as keyof typeof INTEREST_LABEL] ?? i}</StatusChip></li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {(visit.followUps || visit.photoKeys.length > 0) && (
            <section className="card flex flex-col gap-3 p-5">
              {visit.followUps && (
                <div>
                  <h2 className="mb-1 text-[15px] font-bold">Follow-ups</h2>
                  <p className="whitespace-pre-line text-[14px]">{visit.followUps}</p>
                </div>
              )}
              {visit.photoKeys.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {visit.photoKeys.map((k) => (
                    <a key={k} href={publicS3Url(k)} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- filed photo */}
                      <img src={publicS3Url(k)} alt="Visit photo" className="h-24 w-32 rounded-[var(--r-sm)] border border-[var(--border)] object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-4" style={{ flex: "1 1 280px", maxWidth: 380 }}>
          {visit.status === "pending" && !visit.voidedAt && canApprove && <ReviewPanel visitId={id} societyName={visit.society.name} loggerName={logger} />}
          {visit.status === "pending" && !visit.voidedAt && !canApprove && (
            <p className="card p-4 text-[13.5px] text-[var(--text-muted)]">
              {mine ? "Waiting for someone else to approve it." : "Waiting for approval by someone holding the Approve visits permission."}
            </p>
          )}
          {visit.status === "approved" && (
            <section className="card flex flex-col gap-2 p-5" style={{ background: "var(--ok-bg)", color: "var(--ok-fg)", borderColor: "var(--ok-line)" }}>
              <p className="text-[15px] font-bold">Approved — counts for {monthLabel(visit.period)}</p>
              <p className="text-[13.5px]">By {visit.reviewedBy?.name ?? visit.reviewedBy?.email}, {visit.reviewedAt ? formatInstant(visit.reviewedAt) : ""}.</p>
              {actor.permissions.includes("approve_visits") && <NextReviewLink />}
            </section>
          )}
          <section className="card flex flex-col gap-2 p-5 text-[13.5px]">
            <h2 className="mb-1 text-[15px] font-bold">{visit.society.name} in {monthLabel(visit.period)}</h2>
            <p>
              Feedback &amp; upselling visit:{" "}
              <strong>{monthState === "approved" ? "approved" : monthState === "pending" ? "waiting for approval" : monthState === "sent_back" ? "sent back" : "not yet"}</strong>
            </p>
            <ul className="flex flex-col gap-1">
              {monthVisits.map((m) => (
                <li key={m.id}>
                  {m.id === id ? <strong>{formatDate(m.visitedAt)} · {PURPOSE_LABEL[m.purpose]} (this one)</strong> : <Link href={`/admin/visits/${m.id}`} className="underline">{formatDate(m.visitedAt)} · {PURPOSE_LABEL[m.purpose]}</Link>}
                </li>
              ))}
            </ul>
          </section>
          {!visit.voidedAt && (mine ? visit.status !== "approved" : actor.permissions.includes("approve_visits")) && <WithdrawVisit visitId={id} />}
        </aside>
      </div>
    </>
  );
}
