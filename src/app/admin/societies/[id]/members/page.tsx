import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import { GRANT_META } from "@/lib/portal-access";
import { formatMobile } from "@/lib/society-members";
import { MembersClient, type MemberRow } from "./members-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Members" };

/**
 * A society's people and their positions (2026-09-25): current members by
 * default, past ones kept and shown on request, each linked to the portal
 * login made from their record.
 */
export default async function SocietyMembersPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const viewer = await resolveAdmin();
  const { id } = await params;
  const society = await db.society.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!society) notFound();
  const [members, positions, profiles] = await Promise.all([
    db.societyMember.findMany({
      where: { societyId: id },
      include: { position: { select: { name: true, sortOrder: true } }, replacedBy: { select: { name: true } } },
      orderBy: [{ endedOn: "desc" }, { createdAt: "asc" }],
    }),
    db.memberPosition.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    db.profile.findMany({ where: { societyId: id }, select: { id: true, name: true, email: true, portalAuthority: true, isActive: true } }),
  ]);
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const linked = new Set(members.map((m) => m.profileId).filter(Boolean));
  const AUTH: Record<string, string> = { office_bearer: "Office-bearer", committee: "Committee", manager: "Manager" };

  const rows: MemberRow[] = members
    .map((m) => {
      const p = m.profileId ? profileById.get(m.profileId) : null;
      return {
        id: m.id,
        name: m.name,
        mobile: m.mobile,
        mobileLabel: formatMobile(m.mobile),
        email: m.email ?? "",
        positionId: m.positionId,
        position: m.position.name,
        positionOrder: m.position.sortOrder,
        startedOn: m.startedOn ? m.startedOn.toISOString().slice(0, 10) : "",
        startedLabel: m.startedOn ? formatDate(m.startedOn) : null,
        notes: m.notes ?? "",
        current: !m.endedOn,
        endedLabel: m.endedOn ? formatDate(m.endedOn) : null,
        endReason: m.endReason,
        replacedBy: m.replacedBy?.name ?? null,
        portal: p ? `${AUTH[p.portalAuthority ?? ""] ?? "Portal"}${p.isActive ? "" : " (deactivated)"}` : null,
        portalAuthority: p?.portalAuthority ?? null,
      };
    })
    .sort((a, b) => (a.current === b.current ? a.positionOrder - b.positionOrder : a.current ? -1 : 1));

  return (
    <>
      <PageHeader
        backHref={`/admin/societies/${id}`}
        title={`${society.name} — members`}
        subtitle="Who is on the committee and staff, in which position, and how to reach them. Past members are kept."
      />
      <MembersClient
        societyId={id}
        rows={rows}
        positions={positions}
        unlinkedAccounts={profiles
          .filter((p) => p.isActive && !linked.has(p.id))
          .map((p) => ({ id: p.id, name: p.name ?? "", email: p.email, authority: AUTH[p.portalAuthority ?? ""] ?? "Portal" }))}
        grants={GRANT_META.map((g) => ({ id: g.id, label: g.label }))}
        canPortal={!!viewer?.permissions.includes("manage_users")}
        today={new Date().toISOString().slice(0, 10)}
      />
    </>
  );
}
