import { redirect } from "next/navigation";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { PageHeader, StatusChip } from "@/components/ui";
import { loadShowcaseAdmin } from "@/lib/star-showcase-loader";
import { RATING_RULE } from "@/lib/payment-rating";
import { SHOWCASE_DAYS } from "@/lib/star-showcase";
import { StarSocietiesClient, type StarRow } from "./star-societies-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Star partner societies" };

const who = (u: { name: string | null; email: string } | null) => (u ? u.name ?? u.email : null);
const iso = (d: Date | null) => (d ? d.toISOString() : null);

/**
 * Star partner societies (2026-10-21, user-asked; design and evidence in
 * docs/research/reports/Star and defaulter society showcase.md). The system
 * raises a society that pays on time; an admin with approve_showcase decides
 * whether it is shown to other societies, and only with its committee's
 * recorded consent. Every society's payment rating is listed here for the
 * back office — the portal shows a society only its own.
 */
export default async function StarSocietiesPage() {
  const actor = await requireAdminPage();
  if (!actor) redirect("/api/session-ended");
  const admin = await resolveAdmin();
  if (!admin) redirect("/api/session-ended");
  const isOps = admin.permissions.includes("manage_pipeline") && admin.permissions.includes("manage_survey");
  const canApprove = admin.permissions.includes("approve_showcase");

  const now = new Date();
  const data = await loadShowcaseAdmin(now);
  const rows: StarRow[] = data.map((r) => ({
    society: r.society,
    stars: r.rating.stars,
    avgDaysLate: r.rating.avgDaysLate,
    counted: r.rating.counted,
    onTimeCount: r.rating.onTimeCount,
    openCount: r.rating.openCount,
    closed: r.facts.closed,
    markedDefaulter: r.facts.markedDefaulter,
    candidate: r.candidate,
    hiddenReason: r.hiddenReason,
    consent: r.consent
      ? { id: r.consent.id, givenBy: r.consent.givenBy, givenOn: r.consent.givenOn.toISOString(), note: r.consent.note, recordedBy: who(r.consent.recordedBy) }
      : null,
    listings: r.listings.map((l) => ({
      id: l.id,
      origin: l.origin,
      status: l.status,
      live: r.live?.id === l.id,
      ratingStars: l.ratingStars,
      summary: l.summary,
      showSummary: l.showSummary,
      proposedBy: who(l.proposedBy),
      proposedById: l.proposedById,
      proposedAt: l.proposedAt.toISOString(),
      proposalNote: l.proposalNote,
      decidedBy: who(l.decidedBy),
      decidedAt: iso(l.decidedAt),
      decisionNote: l.decisionNote,
      expiresAt: iso(l.expiresAt),
      withdrawnBy: who(l.withdrawnBy),
      withdrawnAt: iso(l.withdrawnAt),
      withdrawnReason: l.withdrawnReason,
    })),
  }));
  const onShowcase = rows.filter((r) => r.listings.some((l) => l.live) && !r.hiddenReason).length;

  return (
    <>
      <PageHeader
        title="Star partner societies"
        subtitle={`Societies that pay on time, shown to other societies on their portal — only with the committee's consent and an admin's approval, for ${SHOWCASE_DAYS} days at a time. A society's own rating is shown only to that society.`}
        chip={<StatusChip tone="ok">{onShowcase} on the showcase</StatusChip>}
      />
      <StarSocietiesClient rows={rows} rule={RATING_RULE} viewerId={admin.id} canApprove={canApprove} canPropose={isOps || canApprove} />
    </>
  );
}
