import Link from "next/link";
import { EmptyState, StatusChip } from "@/components/ui";
import { formatDateTime } from "@/lib/format-date";
import { isOperations } from "@/lib/admin-teams";
import { loadFieldWork } from "@/lib/field-work";
import { requireFieldPage } from "../access";

export const dynamic = "force-dynamic";
export const metadata = { title: "My work" };

/**
 * My work — the same rows as the back office's Field work page, from the
 * same loader (src/lib/field-work.ts), laid out as tappable cards.
 *
 * Each card still opens the back-office screen for that job; the field
 * versions of those screens arrive step by step (19-field-app.md §8).
 */
export default async function WorkPage() {
  const me = await requireFieldPage();
  const mineOnly = !isOperations(me.team);
  const rows = await loadFieldWork(me.id, mineOnly);

  return (
    <>
      <header className="mb-5">
        <h1 className="text-[24px] font-bold leading-tight">{mineOnly ? "My work" : "Field work"}</h1>
        <p className="text-[var(--text-muted)]">
          {mineOnly
            ? "Surveys, light replacements and installations assigned to you."
            : "Every deal's field work, across the team."}
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState title={mineOnly ? "Nothing assigned to you" : "No field work yet"}>
          A survey or a light replacement appears here once it is assigned to you.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.key}>
              <Link href={r.href} className="card block p-4 min-h-[48px]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{r.societyName}</p>
                    <p className="text-[var(--text-muted)]">
                      {r.societyLocation} · {r.serviceLine}
                    </p>
                  </div>
                  <StatusChip tone={r.need.tone}>{r.need.label}</StatusChip>
                </div>
                {r.kind !== "installation" && (
                  <p className="mt-2">
                    {r.visitAt ? (
                      <span className="num font-semibold">{formatDateTime(r.visitAt)}</span>
                    ) : (
                      <span style={{ color: "var(--warn-fg)" }}>No visit booked</span>
                    )}
                    {r.contactName && <span className="text-[var(--text-muted)]"> · ask for {r.contactName}</span>}
                  </p>
                )}
                {!mineOnly && (
                  <p className="text-[var(--text-muted)] mt-1">
                    {r.assigneeName ? `Assigned to ${r.assigneeName}` : "Nobody assigned yet"}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
