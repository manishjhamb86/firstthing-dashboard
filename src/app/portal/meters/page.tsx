import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { resolveTheme } from "@/lib/resolve-theme";
import { Card, EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { PortalShell } from "../portal-shell";
import { MeterStateChip } from "@/components/meter-ui";
import { societyMeterRows } from "@/lib/meter-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meters" };

/**
 * The society's own meters, and nobody else's: the query is scoped to the
 * viewer's societyId server-side (INV-05). The assignment made in the back
 * office is the only thing that puts a meter on this page.
 *
 * A society sees exactly what the back office sees about its own meters —
 * the same view model builds both — and nothing it could act on. Reading a
 * meter is the one thing it can do, and it goes through the same internal
 * action, rate-limited so a page left open cannot spend the account's
 * vendor allowance.
 */
export default async function PortalMetersPage() {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);
  const societyId = viewer.societyId;

  const [theme, society, meters] = await Promise.all([
    resolveTheme(),
    db.society.findUnique({ where: { id: societyId }, select: { name: true } }),
    societyMeterRows(societyId),
  ]);
  if (!society) redirect(STALE_SESSION_EXIT);

  const watched = meters.filter((m) => m.state !== null);
  const reporting = watched.filter((m) => m.state === "reporting");
  const troubled = meters.filter((m) => m.openAlerts.length > 0);
  const todayKwh = meters.reduce((s, m) => s + (m.dayKwh ?? 0), 0);
  const anyReading = meters.some((m) => m.dayKwh !== null);

  return (
    <PortalShell theme={theme} email={viewer.email} societyName={society.name}>
      <PageHeader
        title="Meters"
        subtitle="The meters FirsThing has installed on your common-area lighting."
        chip={
          meters.length === 0 ? undefined : troubled.length > 0 ? (
            <StatusChip tone="warn">{troubled.length} needs attention</StatusChip>
          ) : (
            <StatusChip tone="ok">All reporting</StatusChip>
          )
        }
      />

      {meters.length === 0 ? (
        <Card className="p-6">
          <EmptyState title="No meters connected yet">
            When FirsThing installs a meter on one of your lighting circuits, it appears here with its
            live reading and its consumption history.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-6">
          {troubled.length > 0 && (
            <Card>
              <ul className="space-y-2">
                {troubled.flatMap((m) =>
                  m.openAlerts.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-[var(--r-sm)] p-3 text-[13px]"
                      style={{ background: "var(--warn-bg)", border: "1px solid var(--warn-line)" }}
                    >
                      <StatusChip tone="warn">
                        {a.kind === "offline" ? "Not reachable" : "Out of range"}
                      </StatusChip>
                      <p className="mt-2">{a.message}</p>
                      <p className="mt-1 text-[var(--text-muted)]">
                        FirsThing has been notified and is looking into it.
                      </p>
                    </li>
                  )),
                )}
              </ul>
            </Card>
          )}

          <StatRow>
            <Stat label="Meters" value={meters.length} detail="on your lighting circuits" />
            <Stat
              label="Reporting"
              value={`${reporting.length}/${watched.length}`}
              tone={reporting.length === watched.length ? "accent" : "warn"}
              detail="answering right now"
            />
            <Stat
              label="Today so far"
              value={anyReading ? todayKwh.toFixed(2) : "—"}
              detail={anyReading ? "kWh across every meter" : "no reading yet today"}
            />
          </StatRow>

          <div className="grid gap-4 lg:grid-cols-2">
            {meters.map((m) => (
              <Card key={m.id}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                  <div className="min-w-0">
                    <Link href={`/portal/meters/${m.id}`} className="text-[15px] font-semibold underline">
                      {m.name}
                    </Link>
                    <p className="text-[13px] text-[var(--text-muted)]">
                      {m.circuitLabel ?? "not yet bound to a circuit"}
                    </p>
                  </div>
                  <MeterStateChip state={m.state} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Figure
                    label="Power now"
                    value={m.powerW === null ? "—" : m.powerW.toFixed(0)}
                    unit="W"
                    stale={m.stale}
                    age={m.readAge}
                  />
                  <Figure
                    label="Today so far"
                    value={m.dayKwh === null ? "—" : m.dayKwh.toFixed(2)}
                    unit="kWh"
                    stale={m.stale}
                    age={m.readAge}
                  />
                </div>

                <p className="mt-3 text-xs text-[var(--text-subtle)]">
                  {m.hourlyCount > 0
                    ? `${m.hourlyCount.toLocaleString()} hours of history, to ${m.hourlyTo}.`
                    : "Hourly history has not been uploaded for this meter yet."}
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </PortalShell>
  );
}

/** A figure never appears without its age — see meter-live.ts. */
function Figure({
  label,
  value,
  unit,
  stale,
  age,
}: {
  label: string;
  value: string;
  unit: string;
  stale: boolean;
  age: string;
}) {
  return (
    <div
      className="rounded-[var(--r-md)] p-3"
      style={{ background: "var(--surface-sunken)", border: "1px solid var(--border)" }}
    >
      <p className="lbl mb-1">{label}</p>
      <p className="flex items-baseline gap-1">
        <span
          className="num text-[20px] font-semibold leading-none"
          style={{ color: stale ? "var(--text-muted)" : "var(--accent)" }}
        >
          {value}
        </span>
        <span className="text-[11px] text-[var(--text-muted)]">{unit}</span>
      </p>
      <p className="mt-1 text-xs text-[var(--text-subtle)]">
        {stale ? `last known · ${age}` : age}
      </p>
    </div>
  );
}
