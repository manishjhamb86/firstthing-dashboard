import { redirect } from "next/navigation";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format-date";
import { INTEREST_LABEL, PURPOSE_LABEL, locationWords } from "@/lib/customer-visits";
import { ApprovalsList } from "./approvals-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visit approvals" };

/** Logged visits waiting for someone else to approve them (2026-11-18). */
export default async function VisitApprovalsPage() {
  await requireAdminPage();
  const actor = await resolveAdmin();
  if (!actor?.permissions.includes("approve_visits")) redirect("/admin/visits");
  const visits = await db.customerVisit.findMany({
    where: { status: "pending", voidedAt: null },
    orderBy: { visitedAt: "asc" },
    include: { society: { select: { name: true } }, loggedBy: { select: { id: true, name: true, email: true } } },
  });
  return (
    <>
      <PageHeader
        backHref="/admin/visits"
        title="Visits waiting for approval"
        subtitle="A visit counts only once approved. Check each has a real agenda and outcome; send it back with a reason if not."
      />
      {visits.length === 0 ? (
        <EmptyState title="Nothing waiting">Every logged visit has been reviewed.</EmptyState>
      ) : (
        <ApprovalsList
          visits={visits.map((v) => ({
            id: v.id,
            society: v.society.name,
            purpose: PURPOSE_LABEL[v.purpose],
            feedback: v.purpose === "feedback_upsell",
            when: formatDateTime(v.visitedAt),
            loggedBy: v.loggedBy.name ?? v.loggedBy.email,
            mine: v.loggedBy.id === actor.id,
            agenda: v.agenda,
            outcome: v.outcome,
            evidence: [
              v.metName ? `Met ${v.metName}${v.metRole ? ` (${v.metRole})` : ""}` : null,
              v.rating ? `rating ${v.rating}/5` : null,
              v.photoKeys.length ? `${v.photoKeys.length} photo${v.photoKeys.length === 1 ? "" : "s"}` : null,
              v.interests.length ? `interest: ${v.interests.map((i) => INTEREST_LABEL[i as keyof typeof INTEREST_LABEL] ?? i).join(", ")}` : null,
              locationWords(v.distanceM, v.latitude !== null).text,
            ].filter(Boolean).join(" · "),
          }))}
        />
      )}
    </>
  );
}
