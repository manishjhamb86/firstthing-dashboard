import Link from "next/link";
import { db } from "@/lib/db";
import { Card, StatusChip } from "@/components/ui";
import { formatInstant } from "@/lib/format-date";
import { HELP_STATUS_META, helpCategoryLabel } from "@/lib/help-view";
import { requireFieldPage } from "../../access";

export const dynamic = "force-dynamic";
export const metadata = { title: "My help requests" };

// The reports this person sent with the Help button, newest first. A report
// still on the phone (no signal yet) is in More → Waiting to send instead.
export default async function MyHelpRequests() {
  const me = await requireFieldPage();
  const reports = await db.helpReport.findMany({
    where: { reporterId: me.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, title: true, description: true, status: true, category: true, createdAt: true, _count: { select: { messages: true } } },
  });
  return (
    <>
      <header className="mb-4">
        <Link href="/field/more" className="text-[var(--text-muted)]">
          ← More
        </Link>
        <h1 className="text-[24px] font-bold leading-tight mt-1">My help requests</h1>
        <p className="text-[var(--text-muted)]">What you sent with the Help button, and the answers.</p>
      </header>
      {reports.length === 0 ? (
        <Card className="p-4">
          <p>Nothing sent yet. Tap Help on any screen to ask a question or report a problem.</p>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          {reports.map((r, i) => {
            const meta = HELP_STATUS_META[r.status];
            return (
              <Link key={r.id} href={`/field/more/help/${r.id}`} className={`block px-4 py-3 ${i ? "border-t border-[var(--border-subtle)]" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{r.title ?? (r.description.slice(0, 70) || "Voice note")}</p>
                  <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                </div>
                <p className="text-[13px] text-[var(--text-muted)]">
                  {helpCategoryLabel(r.category)} · {formatInstant(r.createdAt)}
                  {r._count.messages ? ` · ${r._count.messages} ${r._count.messages === 1 ? "reply" : "replies"}` : ""}
                </p>
              </Link>
            );
          })}
        </Card>
      )}
    </>
  );
}
