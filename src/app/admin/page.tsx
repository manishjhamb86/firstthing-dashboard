import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import EmptyState from "@/components/shell/EmptyState";
import StatusChip, { type StatusTone } from "@/components/shell/StatusChip";
import DeltaChip from "@/components/shell/DeltaChip";
import PortfolioFreshness from "./portfolio-freshness";

function monthStart(offsetMonths: number, from = new Date()) {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + offsetMonths, 1));
}

function pctDelta(current: number, previous: number): { text: string; positive: boolean } | null {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? "+" : "";
  return { text: `${sign}${pct.toFixed(1)}%`, positive: pct >= 0 };
}

const MONTH_LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export default async function AdminPortfolioPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const now = new Date();
  const thisMonth = monthStart(0, now);
  const lastMonth = monthStart(-1, now);
  const twelveMonthsAgo = monthStart(-11, now);

  const [
    thisMonthAgg,
    lastMonthAgg,
    chartRows,
    societiesTotal,
    societiesActive,
    societiesOnboarding,
    societiesSuspended,
    devicesTotal,
    devicesOnline,
    overdueInvoices,
    exceptions,
    openExceptionsCount,
    tasks,
    allSocieties,
  ] = await Promise.all([
    db.monthlySocietyMetric.aggregate({
      where: { month: thisMonth },
      _sum: { energyAvoidedKwh: true, billSavingInr: true, co2AvoidedKg: true },
    }),
    db.monthlySocietyMetric.aggregate({
      where: { month: lastMonth },
      _sum: { energyAvoidedKwh: true, billSavingInr: true, co2AvoidedKg: true },
    }),
    db.monthlySocietyMetric.findMany({
      where: { month: { gte: twelveMonthsAgo } },
      select: { month: true, energyAvoidedKwh: true, isVerifiedMetered: true },
    }),
    db.society.count(),
    db.society.count({ where: { status: "active" } }),
    db.society.count({ where: { status: "onboarding" } }),
    db.society.count({ where: { status: "suspended" } }),
    db.device.count(),
    db.device.count({ where: { status: "Online" } }),
    db.invoice.findMany({ where: { status: "Overdue" }, orderBy: { dueDate: "asc" } }),
    db.exception.findMany({
      where: { resolvedAt: null },
      orderBy: [{ severity: "asc" }, { openedAt: "asc" }],
      take: 5,
      include: { society: true },
    }),
    db.exception.count({ where: { resolvedAt: null } }),
    db.task.findMany({
      where: { status: "open" },
      orderBy: [{ dueAt: "asc" }],
      take: 5,
      include: { society: true },
    }),
    db.society.findMany({ include: { devices: true } }),
  ]);

  // --- KPI derivation ---
  const energyMtd = thisMonthAgg._sum.energyAvoidedKwh?.toNumber() ?? 0;
  const energyPrev = lastMonthAgg._sum.energyAvoidedKwh?.toNumber() ?? 0;
  const billMtd = thisMonthAgg._sum.billSavingInr?.toNumber() ?? 0;
  const billPrev = lastMonthAgg._sum.billSavingInr?.toNumber() ?? 0;
  const co2Mtd = thisMonthAgg._sum.co2AvoidedKg?.toNumber() ?? 0;
  const co2Prev = lastMonthAgg._sum.co2AvoidedKg?.toNumber() ?? 0;

  const feedHealthPct = devicesTotal > 0 ? Math.round((devicesOnline / devicesTotal) * 100) : 0;
  const devicesOffline = devicesTotal - devicesOnline;

  const overdueTotal = overdueInvoices.reduce((sum, inv) => sum + (inv.totalAmount?.toNumber() ?? 0), 0);
  const oldestOverdueDays = overdueInvoices[0]?.dueDate
    ? Math.floor((now.getTime() - overdueInvoices[0].dueDate.getTime()) / 86_400_000)
    : 0;

  // --- Chart derivation: metered vs extrapolated energy avoided, last 12 months ---
  const monthBuckets = Array.from({ length: 12 }, (_, i) => monthStart(-11 + i, now));
  const chartData = monthBuckets.map((bucketStart) => {
    const rowsForMonth = chartRows.filter((r) => r.month.getTime() === bucketStart.getTime());
    const metered = rowsForMonth
      .filter((r) => r.isVerifiedMetered)
      .reduce((sum, r) => sum + (r.energyAvoidedKwh?.toNumber() ?? 0), 0);
    const extrapolated = rowsForMonth
      .filter((r) => !r.isVerifiedMetered)
      .reduce((sum, r) => sum + (r.energyAvoidedKwh?.toNumber() ?? 0), 0);
    return {
      label: MONTH_LETTERS[bucketStart.getUTCMonth()],
      metered,
      extrapolated,
    };
  });
  const maxTotal = Math.max(...chartData.map((m) => m.metered + m.extrapolated), 1);
  const maxBarPx = 160;

  // --- Societies at a glance: suspended first, then active by lowest savings %, onboarding last ---
  function priorityRank(status: string) {
    if (status === "suspended") return 0;
    if (status === "active") return 1;
    return 2;
  }
  const sortedSocieties = [...allSocieties].sort((a, b) => {
    const pa = priorityRank(a.status);
    const pb = priorityRank(b.status);
    if (pa !== pb) return pa - pb;
    return a.savingsPercentage.toNumber() - b.savingsPercentage.toNumber();
  });
  const topSocieties = sortedSocieties.slice(0, 5);

  function societyTone(status: string, savingsPct: number): StatusTone {
    if (status === "suspended") return "critical";
    if (status === "onboarding") return "neutral";
    if (savingsPct < 20) return "critical";
    if (savingsPct < 28) return "warning";
    return "good";
  }

  return (
    <div className="flex flex-col gap-5">
      <PortfolioFreshness />

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <KpiTile
          label="ENERGY AVOIDED (MTD)"
          value={(energyMtd / 1000).toFixed(1)}
          unit="MWh"
          delta={pctDelta(energyMtd, energyPrev)}
          deltaTone="good"
          note="vs last month"
        />
        <KpiTile
          label="BILL SAVING (MTD)"
          value={`₹${(billMtd / 100_000).toFixed(1)}`}
          unit="L"
          delta={pctDelta(billMtd, billPrev)}
          deltaTone="good"
          note={`${societiesTotal} societies`}
        />
        <KpiTile
          label="CO2 AVOIDED (MTD)"
          value={(co2Mtd / 1000).toFixed(1)}
          unit="t"
          delta={pctDelta(co2Mtd, co2Prev)}
          deltaTone="good"
          note="vs last month"
        />
        <KpiTile
          label="ACTIVE SOCIETIES"
          value={String(societiesActive)}
          unit={`/ ${societiesTotal}`}
          note={`${societiesOnboarding} onboarding · ${societiesSuspended} suspended`}
        />
        <KpiTile
          label="FEED HEALTH"
          value={String(feedHealthPct)}
          unit="%"
          delta={devicesOffline > 0 ? { text: `${devicesOffline} stale`, positive: false } : null}
          deltaTone="warning"
          note={`${devicesTotal} devices`}
        />
        <KpiTile
          label="INVOICE OVERDUE"
          value={`₹${(overdueTotal / 100_000).toFixed(1)}`}
          unit="L"
          delta={overdueInvoices.length > 0 ? { text: `${overdueInvoices.length} invoices`, positive: false } : null}
          deltaTone="critical"
          note={overdueInvoices.length > 0 ? `oldest ${oldestOverdueDays}d` : "none overdue"}
        />
        <KpiTile label="REPORT TURNAROUND" value="—" unit="" note="Not yet tracked — no submitted→published timestamps in the schema" muted />
        <KpiTile label="INSPECTION CYCLE" value="—" unit="" note="Not yet tracked — no scheduled→completed timestamps in the schema" muted />
      </div>

      {/* Chart + Exceptions */}
      <div className="grid gap-4 lg:grid-cols-[1.62fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-ink">Portfolio savings vs baseline</div>
              <div className="mt-1 text-[11px] text-m2">
                kWh avoided · {societiesTotal} societies · extrapolated from metered sample
              </div>
            </div>
            <div className="flex gap-0.5 rounded-[9px] bg-card-3 p-[3px]">
              {["12M", "QTR", "MTD"].map((r) => (
                <span
                  key={r}
                  className="rounded-[7px] px-2.5 py-1 font-mono text-[10px] font-semibold"
                  style={
                    r === "12M"
                      ? { background: "var(--card)", color: "var(--ink)", boxShadow: "0 1px 2px rgba(0,0,0,.05)" }
                      : { color: "var(--m2)" }
                  }
                >
                  {r}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-5 flex h-[172px] items-end gap-2">
            {chartData.map((m, i) => {
              const meteredPx = (m.metered / maxTotal) * maxBarPx;
              const extrapolatedPx = (m.extrapolated / maxTotal) * maxBarPx;
              const totalK = Math.round((m.metered + m.extrapolated) / 1000);
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className="font-mono text-[9px] text-m2">{totalK > 0 ? `${totalK}k` : ""}</div>
                  <div className="flex w-full flex-col justify-end" style={{ height: `${maxBarPx}px` }}>
                    <div
                      style={{
                        height: `${meteredPx}px`,
                        background: "linear-gradient(180deg, var(--lime), var(--ac))",
                        borderRadius: "5px 5px 2px 2px",
                      }}
                    />
                    <div
                      style={{
                        height: `${extrapolatedPx}px`,
                        background: "var(--bd3)",
                        borderRadius: extrapolatedPx > 0 ? "0 0 5px 5px" : 0,
                      }}
                    />
                  </div>
                  <div className="font-mono text-[9.5px] text-m2">{m.label}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-4 border-t border-dashed border-border pt-3 text-[10.5px] text-m2">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: "linear-gradient(180deg, var(--lime), var(--ac))" }}
              />
              Verified metered saving
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--bd3)" }} />
              Extrapolated (±6.2% CI)
            </span>
          </div>
        </div>

        <div className="flex flex-col rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-ink">Exceptions</div>
            <StatusChip tone="critical">{openExceptionsCount} OPEN</StatusChip>
          </div>

          <div className="mt-3 flex flex-1 flex-col gap-2">
            {exceptions.length === 0 && (
              <EmptyState title="No open exceptions" description="Every feed and workflow is currently clean." />
            )}
            {exceptions.map((e) => {
              const tone: StatusTone =
                e.severity === "critical" || e.severity === "high" ? "critical" : "warning";
              const ageMs = now.getTime() - e.openedAt.getTime();
              const ageText =
                ageMs < 3_600_000
                  ? `${Math.max(1, Math.round(ageMs / 60_000))}m`
                  : ageMs < 86_400_000
                    ? `${Math.round(ageMs / 3_600_000)}h`
                    : `${Math.round(ageMs / 86_400_000)}d`;
              const color = tone === "critical" ? "var(--bf)" : "var(--wf)";
              const bg = tone === "critical" ? "var(--bb2)" : "var(--wb2)";
              return (
                <div
                  key={e.id.toString()}
                  className="rounded-[8px] border-l-[3px] px-3 py-2"
                  style={{ borderColor: color, background: bg }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-semibold text-ink">{e.title}</div>
                    <div className="font-mono text-[10.5px] font-bold" style={{ color }}>
                      {ageText}
                    </div>
                  </div>
                  {(e.society?.name || e.category) && (
                    <div className="mt-0.5 text-[10.5px] text-m1">
                      {[e.society?.name, e.category].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="mt-3 w-full rounded-[9px] border border-border px-3 py-2 text-xs font-semibold text-ac"
          >
            Open exception queue
          </button>
        </div>
      </div>

      {/* Pending tasks + Societies at a glance */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-sm font-bold text-ink">Pending tasks</div>
          <div className="mt-1 text-[11px] text-m2">Actionable — each row opens its workflow</div>

          <div className="mt-3">
            {tasks.length === 0 && (
              <EmptyState title="No open tasks" description="Nothing needs action across the portfolio right now." />
            )}
            {tasks.map((t) => {
              const dueMs = t.dueAt ? t.dueAt.getTime() - now.getTime() : null;
              const slaTone =
                dueMs === null ? "var(--m1)" : dueMs < 0 ? "var(--bf)" : dueMs < 86_400_000 ? "var(--wf)" : "var(--m1)";
              const slaText = t.dueAt
                ? dueMs !== null && dueMs < 0
                  ? "Overdue"
                  : dueMs !== null && dueMs < 86_400_000
                    ? "Today"
                    : `${Math.round((dueMs ?? 0) / 86_400_000)}d`
                : "No due date";
              return (
                <Link
                  key={t.id.toString()}
                  href="/admin/societies"
                  className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0"
                >
                  <StatusChip tone="neutral">{t.type}</StatusChip>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-ink">{t.title}</div>
                    <div className="truncate text-[10.5px] text-m2">
                      {[t.society?.name, t.assignee].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="font-mono text-[10px] font-bold" style={{ color: slaTone }}>
                    {slaText}
                  </div>
                  <div className="text-[11px] font-bold text-ac">Open</div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-ink">Societies at a glance</div>
              <div className="mt-1 text-[11px] text-m2">Sorted by attention needed</div>
            </div>
            <Link href="/admin/societies" className="text-[11px] font-semibold text-ac">
              View all {societiesTotal} →
            </Link>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            {topSocieties.length === 0 && (
              <EmptyState title="No societies yet" description="Add the first society to see it here." />
            )}
            {topSocieties.map((s) => {
              const pct = s.savingsPercentage.toNumber();
              const tone = societyTone(s.status, pct);
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded-[11px] border border-border-2 bg-card-2 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-ink">{s.name}</div>
                    <div className="truncate font-mono text-[10.5px] text-m2">
                      {s.status === "onboarding" ? "Onboarding" : `${s.devices.length} devices`}
                    </div>
                  </div>
                  {s.status !== "onboarding" && (
                    <div className="w-[74px] flex-none">
                      <div className="h-[5px] rounded-full" style={{ background: "var(--bd3)" }}>
                        <div
                          className="h-[5px] rounded-full"
                          style={{ width: `${Math.min(100, pct * 2)}%`, background: "var(--ac)" }}
                        />
                      </div>
                      <div className="mt-0.5 text-right font-mono text-[9.5px] text-m1">{pct}%</div>
                    </div>
                  )}
                  <StatusChip tone={tone}>
                    {s.status === "suspended" ? "SUSPENDED" : s.status === "onboarding" ? "ONBOARDING" : tone === "critical" ? "CRITICAL" : tone === "warning" ? "ATTENTION" : "GOOD"}
                  </StatusChip>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  unit,
  delta,
  deltaTone = "good",
  note,
  muted,
}: {
  label: string;
  value: string;
  unit: string;
  delta?: { text: string; positive: boolean } | null;
  deltaTone?: "good" | "warning" | "critical";
  note: string;
  muted?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4 ${muted ? "opacity-60" : ""}`}>
      <div className="font-mono text-[9.5px] font-semibold tracking-[0.07em] text-m2">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-[26px] font-extrabold tracking-[-1px] text-ink">{value}</span>
        {unit && <span className="text-[11px] font-semibold text-m1">{unit}</span>}
      </div>
      {delta && (
        <div>
          <DeltaChip value={delta.text} positive={deltaTone !== "critical" && delta.positive} />
        </div>
      )}
      <div className="text-[10.5px] font-medium text-m2">{note}</div>
    </div>
  );
}
