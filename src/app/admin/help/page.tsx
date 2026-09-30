import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { formatInstant, timeAgo } from "@/lib/format-date";
import { HELP_STATUS_META, helpCategoryLabel } from "@/lib/help-view";
import type { HelpStatus, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team help desk" };

// What the field team reported with the Help button (docs/engineering/21-field-help.md):
// questions the AI answered, bugs, blockers on site, suggestions.
const VIEWS: { key: string; label: string; statuses: HelpStatus[] | null }[] = [
  { key: "open", label: "Needs a person", statuses: ["new", "open", "in_progress"] },
  { key: "answered", label: "Answered by the AI", statuses: ["answered"] },
  { key: "resolved", label: "Resolved", statuses: ["resolved"] },
  { key: "all", label: "All", statuses: null },
];

export default async function HelpDesk({ searchParams }: { searchParams: Promise<{ view?: string; mine?: string }> }) {
  await requireAdminPage();
  const admin = (await resolveAdmin())!;
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.key === sp.view) ?? VIEWS[0];
  const mine = sp.mine === "1";
  const where: Prisma.HelpReportWhereInput = {
    ...(view.statuses ? { status: { in: view.statuses } } : {}),
    ...(mine ? { routedToIds: { has: admin.id } } : {}),
  };
  const [reports, counts] = await Promise.all([
    db.helpReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { reporter: { select: { name: true, email: true } }, task: { select: { title: true } } },
    }),
    db.helpReport.groupBy({ by: ["status"], _count: true }),
  ]);
  const countOf = (statuses: HelpStatus[] | null) => counts.filter((c) => !statuses || statuses.includes(c.status)).reduce((a, c) => a + c._count, 0);
  const href = (v: string, m: boolean) => `/admin/help?view=${v}${m ? "&mine=1" : ""}`;

  return (
    <>
      <PageHeader title="Team help desk" subtitle="What the field team sent with the Help button on their phones — questions, bugs, blockers on site and suggestions." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => (
          <Link key={v.key} href={href(v.key, mine)} className={`chip ${v.key === view.key ? "chip-info" : "chip-neu"}`} aria-current={v.key === view.key ? "page" : undefined}>
            {v.label} · {countOf(v.statuses)}
          </Link>
        ))}
        <Link href={href(view.key, !mine)} className={`chip ${mine ? "chip-info" : "chip-neu"}`}>
          {mine ? "✓ " : ""}Sent to me
        </Link>
      </div>
      <Card className="p-0 overflow-hidden">
        {reports.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Nothing here">Reports from the field app&apos;s Help button appear here.</EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Report</th>
                  <th className="hidden md:table-cell">From</th>
                  <th>What it is</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => {
                  const meta = HELP_STATUS_META[r.status];
                  return (
                    <tr key={r.id}>
                      <td className="max-w-[26rem]">
                        <Link href={`/admin/help/${r.id}`} className="font-medium hover:underline">
                          {r.title ?? (r.description.slice(0, 80) || "Voice note")}
                        </Link>
                        <p className="text-[12px]" style={{ color: "var(--text-subtle)" }} title={formatInstant(r.createdAt)}>
                          {timeAgo(r.createdAt)} · {r.page}
                          {r.task ? ` · ${r.task.title}` : ""}
                          <span className="md:hidden"> · {r.reporter.name ?? r.reporter.email}</span>
                        </p>
                      </td>
                      <td className="hidden md:table-cell text-[var(--text-muted)]">{r.reporter.name ?? r.reporter.email}</td>
                      <td>
                        {helpCategoryLabel(r.category)}
                        {r.aiState !== "done" && (
                          <p className="text-[12px]" style={{ color: "var(--warn-fg)" }}>
                            Not read by the AI
                          </p>
                        )}
                      </td>
                      <td>
                        <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
