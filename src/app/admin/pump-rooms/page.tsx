import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { formatDate, formatInstant } from "@/lib/format-date";
import { ClassifyForm } from "./classify-form";
import { SweepButton } from "./sweep-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pump rooms" };

// EMS pump-room energy meter — ingested automatically from a daily vendor
// email, classified by hand once (mirrors water tanks' own setupType /
// societyId assignment), read forever. One pump room per society for now.
export default async function PumpRoomsPage() {
  await requireAdminPage();
  const actor = await resolveAdmin();
  if (!actor?.permissions.includes("manage_users")) redirect("/admin");

  const [meters, queue, societies, lastApplied] = await Promise.all([
    db.emsPumpMeter.findMany({
      orderBy: [{ societyId: "desc" }, { vendorSubjectLabel: "asc" }],
      include: { society: { select: { id: true, name: true, location: true } } },
    }),
    db.emsPumpEmailIngest.findMany({
      where: { status: "needs_assignment" },
      orderBy: { receivedAt: "desc" },
      select: { subjectLabel: true, receivedAt: true },
    }),
    db.society.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, location: true } }),
    db.emsPumpEmailIngest.findFirst({ where: { status: "applied" }, orderBy: { appliedAt: "desc" }, select: { appliedAt: true } }),
  ]);

  // One row per distinct subject the queue still holds, newest first —
  // several backlog emails for the same unclassified label collapse to one
  // "classify this" card rather than one per day.
  const bySubject = new Map<string, { count: number; firstReceivedAt: Date; lastReceivedAt: Date }>();
  for (const q of queue) {
    const cur = bySubject.get(q.subjectLabel);
    if (!cur) bySubject.set(q.subjectLabel, { count: 1, firstReceivedAt: q.receivedAt, lastReceivedAt: q.receivedAt });
    else {
      cur.count++;
      if (q.receivedAt < cur.firstReceivedAt) cur.firstReceivedAt = q.receivedAt;
      if (q.receivedAt > cur.lastReceivedAt) cur.lastReceivedAt = q.receivedAt;
    }
  }
  const unclassified = [...bySubject.entries()].sort((a, b) => b[1].lastReceivedAt.getTime() - a[1].lastReceivedAt.getTime());

  const unassigned = meters.filter((m) => m.societyId === null);

  return (
    <>
      <PageHeader
        title="Pump rooms"
        chip={
          unclassified.length > 0 ? (
            <StatusChip tone="warn">{unclassified.length} waiting to be classified</StatusChip>
          ) : (
            <StatusChip tone="ok">Nothing waiting</StatusChip>
          )
        }
        subtitle="Daily EMS pump-room meter emails, read automatically — classify each subject once, then it's read forever."
        action={
          <div className="flex gap-2">
            <SweepButton />
            <Link href="/admin/settings/google-gmail" className="btn-ghost">
              Mailbox settings
            </Link>
          </div>
        }
      />

      <StatRow>
        <Stat label="Pump rooms" value={meters.length} detail="classified so far" />
        <Stat
          label="Waiting to classify"
          value={unclassified.length}
          tone={unclassified.length > 0 ? "warn" : "ok"}
          detail={unclassified.length === 0 ? "every subject has a pump room" : "subjects with no match yet"}
        />
        <Stat
          label="Unassigned"
          value={unassigned.length}
          tone={unassigned.length > 0 ? "warn" : "ok"}
          detail={unassigned.length === 0 ? "every room has a society" : "classified but no society"}
        />
        <Stat label="Last applied" value={lastApplied?.appliedAt ? formatDate(lastApplied.appliedAt) : "—"} detail="most recent day's figure landed" />
      </StatRow>

      {unclassified.length > 0 && (
        <Card className="mb-5 p-5 sm:p-6">
          <CardTitle>Needs classification</CardTitle>
          <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
            The exact label in the vendor&apos;s subject line — match it to the society and pump room type. Every backlog
            email for this label is recovered automatically once classified.
          </p>
          <div className="space-y-4">
            {unclassified.map(([subjectLabel, info]) => (
              <div key={subjectLabel} className="rounded-[var(--r-sm)] border p-4" style={{ borderColor: "var(--border)" }}>
                <p className="mb-2 text-[14px] font-semibold">{subjectLabel}</p>
                <p className="mb-3 text-[12px]" style={{ color: "var(--text-subtle)" }}>
                  {info.count} email{info.count === 1 ? "" : "s"} waiting · first {formatDate(info.firstReceivedAt)} · last{" "}
                  {formatDate(info.lastReceivedAt)}
                </p>
                <ClassifyForm subjectLabel={subjectLabel} societies={societies} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {meters.length === 0 ? (
        <EmptyState title="No pump rooms classified yet">
          Once the EMS vendor&apos;s email starts arriving at the dedicated mailbox, its subject line appears above to
          classify.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="tbl">
            <thead>
              <tr>
                <th>Society</th>
                <th>Type</th>
                <th>Last reading</th>
                <th className="text-right">kWh / day</th>
              </tr>
            </thead>
            <tbody>
              {meters.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link href={`/admin/pump-rooms/${m.id}`} className="font-semibold hover:underline">
                      {m.society ? m.society.name : m.vendorSubjectLabel}
                    </Link>
                    {!m.society && (
                      <span className="block text-xs" style={{ color: "var(--warn-fg)" }}>
                        Not assigned to a society
                      </span>
                    )}
                  </td>
                  <td className="capitalize">{m.roomType ?? "—"}</td>
                  <td>
                    {m.lastReadingAt ? (
                      <>
                        <span className="num">{formatInstant(m.lastReadingAt)}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="num text-right">{m.lastKwh !== null ? m.lastKwh.toFixed(2) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
