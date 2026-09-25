import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-permissions";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import { formatMobile } from "@/lib/society-members";
import { FmCompanyButton } from "../company-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const c = await db.facilityManagementCompany.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: c?.name ?? "Facility management" };
}

const span = (from: Date, to: Date | null) => `${formatDate(from)} – ${to ? formatDate(to) : "now"}`;

export default async function FmCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const c = await db.facilityManagementCompany.findUnique({
    where: { id },
    include: {
      engagements: { orderBy: [{ endedOn: { sort: "asc", nulls: "first" } }, { startedOn: "desc" }], include: { society: { select: { id: true, name: true } } } },
      employees: {
        orderBy: [{ endedOn: { sort: "asc", nulls: "first" } }, { startedOn: "desc" }],
        include: { societyMember: { select: { endedOn: true, society: { select: { id: true, name: true } } } } },
      },
    },
  });
  if (!c) notFound();
  const current = c.employees.filter((e) => !e.endedOn);
  const past = c.employees.filter((e) => e.endedOn);
  // Where a past employee went next — the same person (mobile) at another company.
  const moves = past.length
    ? await db.fmEmployment.findMany({
        where: { mobile: { in: past.map((e) => e.mobile) }, companyId: { not: c.id } },
        include: { company: { select: { id: true, name: true } } },
        orderBy: { startedOn: "asc" },
      })
    : [];
  return (
    <>
      <PageHeader
        backHref="/admin/facility-management"
        title={c.name}
        chip={c.active ? undefined : <StatusChip tone="neu">Inactive</StatusChip>}
        subtitle={[c.gstin && `GSTIN ${c.gstin}`, c.contact, c.phone, c.email, c.address].filter(Boolean).join(" · ") || "No contact details recorded."}
        action={
          <FmCompanyButton
            className="btn-secondary btn-sm"
            company={{ id: c.id, name: c.name, gstin: c.gstin ?? "", contact: c.contact ?? "", phone: c.phone ?? "", email: c.email ?? "", address: c.address ?? "", notes: c.notes ?? "", active: c.active }}
          />
        }
      />
      {c.notes && <p className="mb-4 whitespace-pre-line text-[13.5px]">{c.notes}</p>}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <CardTitle>Societies</CardTitle>
          {c.engagements.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Not recorded against any society yet.</p>
          ) : (
            <ul className="space-y-2 text-[13.5px]">
              {c.engagements.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-2">
                  <Link href={`/admin/societies/${e.society.id}`} className="font-semibold">{e.society.name}</Link>
                  <span style={{ color: "var(--text-subtle)" }}>{span(e.startedOn, e.endedOn)}</span>
                  {!e.endedOn && <StatusChip tone="ok">Current</StatusChip>}
                  {e.endReason && <span className="text-[12px]" style={{ color: "var(--text-subtle)" }}>— {e.endReason}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <CardTitle>People · {current.length} now</CardTitle>
          {c.employees.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              Nobody recorded yet. Mark a society member as employed by this company on the society&apos;s Members page.
            </p>
          ) : (
            <ul className="space-y-2 text-[13.5px]">
              {[...current, ...past].map((e) => {
                const next = e.endedOn ? moves.find((m) => m.mobile === e.mobile && m.startedOn > e.startedOn) : null;
                return (
                  <li key={e.id}>
                    <span className="font-semibold">{e.personName}</span>
                    {e.designation && <span> · {e.designation}</span>}
                    <span style={{ color: "var(--text-subtle)" }}> · {formatMobile(e.mobile)}</span>
                    <span className="block text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                      {span(e.startedOn, e.endedOn)}
                      {e.societyMember && (
                        <>
                          {" · at "}
                          <Link href={`/admin/societies/${e.societyMember.society.id}/members`}>{e.societyMember.society.name}</Link>
                          {e.societyMember.endedOn ? ` (left ${formatDate(e.societyMember.endedOn)})` : ""}
                        </>
                      )}
                      {e.endReason && ` · ${e.endReason}`}
                      {next && (
                        <>
                          {" → now at "}
                          <Link href={`/admin/facility-management/${next.company.id}`}>{next.company.name}</Link>
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
