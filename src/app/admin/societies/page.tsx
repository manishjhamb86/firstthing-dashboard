import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import StatusChip, { type StatusTone } from "@/components/shell/StatusChip";
import EmptyState from "@/components/shell/EmptyState";

function statusTone(status: string): StatusTone {
  if (status === "active") return "good";
  if (status === "onboarding") return "neutral";
  return "critical"; // suspended, archived
}

export default async function SocietiesPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const societies = await db.society.findMany({
    orderBy: { name: "asc" },
    include: { devices: true },
  });

  const counts = {
    all: societies.length,
    active: societies.filter((s) => s.status === "active").length,
    onboarding: societies.filter((s) => s.status === "onboarding").length,
    suspended: societies.filter((s) => s.status === "suspended").length,
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3.5">
        <FilterChip label={`All ${counts.all}`} active />
        <FilterChip label={`Active ${counts.active}`} />
        <FilterChip label={`Onboarding ${counts.onboarding}`} />
        <FilterChip label={`Suspended ${counts.suspended}`} />
      </div>

      <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_.8fr] gap-2 bg-card-2 px-5 py-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-m2 sm:grid">
        <div>Society</div>
        <div>Units</div>
        <div>Meters</div>
        <div>Status</div>
        <div />
      </div>

      {societies.length === 0 && (
        <div className="p-6">
          <EmptyState title="No societies yet" description="Add the first society to get started." />
        </div>
      )}

      {societies.map((society) => (
        <div
          key={society.id}
          className="grid grid-cols-2 items-center gap-2 border-t border-border px-5 py-3.5 hover:bg-card-2 sm:grid-cols-[2fr_1fr_1fr_1fr_.8fr]"
        >
          <div className="col-span-2 sm:col-span-1">
            <div className="text-xs font-semibold text-ink">{society.name}</div>
            <div className="text-[10.5px] text-m2">{society.city || "-"}</div>
          </div>
          <div className="font-mono text-xs text-ink">{society.totalLights || "-"} units</div>
          <div className="font-mono text-xs text-ink">{society.devices.length} meters</div>
          <div>
            <StatusChip tone={statusTone(society.status)}>{society.status.toUpperCase()}</StatusChip>
          </div>
          <div className="text-right">
            <Link href={`/admin/societies/${society.id}`} className="text-xs font-semibold text-ac">
              Open
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function FilterChip({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className="rounded-[9px] px-3 py-1.5 text-[11px] font-semibold"
      style={
        active
          ? { background: "var(--ac)", color: "var(--onac)" }
          : { background: "var(--card)", color: "var(--m1)", border: "1px solid var(--bd)" }
      }
    >
      {label}
    </span>
  );
}
