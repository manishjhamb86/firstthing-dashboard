import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import { EnquiryControls } from "./enquiry-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marketing enquiries" };

// The public homepage's "Request an Assessment" form lands here (2026-10-16,
// user-asked: "wire the backend apis for contact us"). Any admin may read
// it; following one up is sales work (manage_pipeline), re-checked in the
// action — same split as the society request desk (/admin/tickets).
export default async function MarketingEnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdminPage();
  const admin = await resolveAdmin();
  const canAct = admin?.permissions.includes("manage_pipeline") ?? false;
  const { status } = await searchParams;
  const filter = status === "open" || status === "followed_up" ? status : undefined;

  const where =
    filter === "open" ? { followedUpAt: null } : filter === "followed_up" ? { followedUpAt: { not: null } } : undefined;

  const [enquiries, openCount, followedUpCount] = await Promise.all([
    db.marketingEnquiry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { followedUpBy: { select: { name: true, email: true } } },
    }),
    db.marketingEnquiry.count({ where: { followedUpAt: null } }),
    db.marketingEnquiry.count({ where: { followedUpAt: { not: null } } }),
  ]);

  const chip = (key: string | undefined, label: string, count: number) => (
    <Link
      key={label}
      href={key ? `/admin/marketing-enquiries?status=${key}` : "/admin/marketing-enquiries"}
      className="chip"
      style={
        filter === key
          ? { background: "var(--accent)", color: "var(--text-on-accent)", borderColor: "var(--accent)" }
          : { background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }
      }
    >
      {label} · {count}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Marketing enquiries"
        subtitle="Requests from the public homepage's assessment form."
        chip={openCount > 0 ? <StatusChip tone="warn">{openCount} open</StatusChip> : undefined}
      />

      <StatRow>
        <Stat label="Open" value={String(openCount)} tone={openCount > 0 ? "warn" : undefined} detail="nobody has followed up yet" />
        <Stat label="Followed up" value={String(followedUpCount)} />
      </StatRow>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {chip(undefined, "All", openCount + followedUpCount)}
        {chip("open", "Open", openCount)}
        {chip("followed_up", "Followed up", followedUpCount)}
      </div>

      <Card className="p-6">
        <CardTitle>Enquiries</CardTitle>
        {enquiries.length === 0 ? (
          <EmptyState title="Nothing here">
            {filter ? "No enquiries with this status." : "Nobody has submitted the homepage's form yet."}
          </EmptyState>
        ) : (
          <>
            <div className="hidden sm:block">
              <table className="tbl w-full">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Organisation</th>
                    <th>Mobile</th>
                    <th>Interested in</th>
                    <th>Date</th>
                    <th>Status</th>
                    {canAct && <th className="text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {enquiries.map((e) => (
                    <tr key={e.id}>
                      <td className="font-semibold">{e.name}</td>
                      <td>{e.organisation}</td>
                      <td className="num">
                        <a href={`tel:+91${e.mobile}`} className="hover:underline">
                          {e.mobile}
                        </a>
                      </td>
                      <td className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                        {e.interest}
                      </td>
                      <td className="num text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                        {formatDate(e.createdAt)}
                      </td>
                      <td>
                        {e.followedUpAt ? (
                          <>
                            <StatusChip tone="ok">Followed up</StatusChip>
                            {e.followedUpNote && (
                              <span className="block max-w-[260px] text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                                {e.followedUpNote}
                                {e.followedUpBy && ` — ${e.followedUpBy.name ?? e.followedUpBy.email}`}
                              </span>
                            )}
                          </>
                        ) : (
                          <StatusChip tone="warn">Open</StatusChip>
                        )}
                      </td>
                      {canAct && (
                        <td>
                          <EnquiryControls enquiryId={e.id} followedUp={!!e.followedUpAt} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-2.5 sm:hidden">
              {enquiries.map((e) => (
                <div key={e.id} className="card p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 font-semibold">{e.name}</p>
                    <div className="shrink-0">
                      {e.followedUpAt ? <StatusChip tone="ok">Followed up</StatusChip> : <StatusChip tone="warn">Open</StatusChip>}
                    </div>
                  </div>
                  <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                    {e.organisation} ·{" "}
                    <a href={`tel:+91${e.mobile}`} className="hover:underline">
                      {e.mobile}
                    </a>
                  </p>
                  <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                    {e.interest} · <span className="num">{formatDate(e.createdAt)}</span>
                  </p>
                  {e.followedUpAt && e.followedUpNote && (
                    <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                      {e.followedUpNote}
                      {e.followedUpBy && ` — ${e.followedUpBy.name ?? e.followedUpBy.email}`}
                    </p>
                  )}
                  {canAct && (
                    <div className="mt-2.5 border-t pt-2" style={{ borderColor: "var(--border-subtle)" }}>
                      <EnquiryControls enquiryId={e.id} followedUp={!!e.followedUpAt} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </>
  );
}
