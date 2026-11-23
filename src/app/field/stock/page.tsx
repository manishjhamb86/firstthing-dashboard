import Link from "next/link";
import { EmptyState, StatusChip } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import { loadOpenSlips } from "@/lib/stock-workflow-loader";
import { requireFieldPage } from "../access";

export const dynamic = "force-dynamic";
export const metadata = { title: "My stock" };

const fmt = (n: number, unit: string) => `${n.toLocaleString("en-IN")}${unit === "m" ? " m" : ""}`;

/**
 * Stock issued to this person and not yet installed or returned
 * (2026-11-23), grouped by the slip it came on — one slip is one society's job.
 */
export default async function MyStockPage() {
  const me = await requireFieldPage();
  const slips = await loadOpenSlips({ employeeId: me.id });
  const held = slips.reduce((s, x) => s + x.held, 0);
  const overdue = slips.filter((s) => s.state === "overdue");

  return (
    <>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold leading-tight">My stock</h1>
          <p className="text-[var(--text-muted)]">{slips.length ? `${held.toLocaleString("en-IN")} items with you` : "Nothing issued to you right now."}</p>
        </div>
        <Link href="/field/scan" className="btn-secondary btn-sm shrink-0">
          Scan
        </Link>
      </header>

      {overdue.map((s) => (
        <p key={s.id} className="mb-3 rounded-[var(--r-md)] border px-3.5 py-3 text-[14px]" style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line, var(--border))", color: "var(--warn-fg)" }}>
          <strong>
            {s.lines
              .filter((l) => l.held > 0)
              .map((l) => `${fmt(l.held, l.item.unit)} ${l.item.name}`)
              .join(", ")}{" "}
            overdue
          </strong>{" "}
          for {s.society.name} — due {formatDate(s.dueOn)}. Install or bring back.
        </p>
      ))}

      {slips.length === 0 ? (
        <EmptyState title="No stock with you">When the office issues you stock for a job, it shows here until you install it or bring it back.</EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {slips.map((s) => (
            <div key={s.id} className="card overflow-hidden">
              <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3.5">
                <div>
                  <p className="text-[16px] font-bold">{s.society.name}</p>
                  <p className="text-[13px] text-[var(--text-muted)]">
                    Slip <span className="num">{s.code}</span> · install by {formatDate(s.dueOn)}
                  </p>
                </div>
                <StatusChip tone={s.state === "overdue" ? "warn" : s.state === "due_soon" ? "info" : "ok"}>
                  {s.state === "overdue" ? `${s.daysLate} day${s.daysLate === 1 ? "" : "s"} late` : s.state === "due_soon" ? "Due soon" : "On time"}
                </StatusChip>
              </div>
              {s.lines
                .filter((l) => l.held > 0)
                .map((l) => (
                  <div key={l.itemTypeId} className="flex justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-2.5 text-[15px]">
                    <span>{l.item.name}</span>
                    <span className="num font-semibold">{fmt(l.held, l.item.unit)}</span>
                  </div>
                ))}
              <div className="grid grid-cols-2 gap-2.5 p-4">
                <Link href={`/field/stock/${s.id}?do=install`} className="btn-primary min-h-[48px] text-center">
                  Install at site
                </Link>
                <Link href={`/field/stock/${s.id}?do=return`} className="btn-secondary min-h-[48px] text-center">
                  Return
                </Link>
              </div>
            </div>
          ))}
          <p className="text-center text-[13px] text-[var(--text-muted)]">Works without signal — what you record is sent when you&apos;re back online.</p>
        </div>
      )}
    </>
  );
}
