import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { resolveTheme } from "@/lib/resolve-theme";
import { Card, CardTitle, ChartPending, EmptyState, PageHeader, Stat, StatPending, StatRow, StatusChip } from "@/components/ui";
import { PortalShell } from "../portal-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lighting" };

// The society's own view of the lighting retrofit. Real where the figures
// exist — the benchmark and the readings behind it are INV-02's audit trail,
// and showing them is the whole point of a number a society is billed on —
// and honestly empty where they do not (monthly bills need MS-08's released
// calculation). Scoped to the viewer's own society server-side (INV-05).
export default async function PortalLightingPage() {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);
  const societyId = viewer.societyId;

  const [theme, society, circuits, contract] = await Promise.all([
    resolveTheme(),
    db.society.findUnique({ where: { id: societyId } }),
    db.circuit.findMany({
      where: { societyId, voidedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        location: true,
        lightType: true,
        meteredLightCount: true,
        representedLightCount: true,
        preInstallBaseline: true,
        benchmarkSavingsPct: true,
        state: true,
      },
    }),
    // The share lives on the effective TERM VERSION, not the contract —
    // amendments are versioned forward-only (ADR-005), so the current one is
    // the latest by version.
    db.contractTermVersion.findFirst({
      where: { contract: { pipeline: { societyId }, status: "active" } },
      orderBy: { version: "desc" },
      select: { revenueSharePct: true },
    }),
  ]);
  if (!society) redirect("/login");

  const benchmarked = circuits.filter((c) => c.benchmarkSavingsPct !== null);
  const best = benchmarked[0] ?? null;
  const totalLights = circuits.reduce((n, c) => n + c.representedLightCount, 0);
  // The post-install daily figure the benchmark implies — derived from the
  // two numbers already shown, never a third stored one.
  const afterKwh =
    best?.preInstallBaseline != null && best.benchmarkSavingsPct != null
      ? best.preInstallBaseline * (1 - best.benchmarkSavingsPct / 100)
      : null;

  return (
    <PortalShell theme={theme} email={viewer.email} societyName={society.name}>
      <PageHeader
        title="Lighting"
        subtitle="What the lighting retrofit is doing for you."
        chip={
          best ? (
            <StatusChip tone="ok">Verified {best.benchmarkSavingsPct!.toFixed(1)}%</StatusChip>
          ) : (
            <StatusChip tone="info">In commissioning</StatusChip>
          )
        }
      />

      {circuits.length === 0 ? (
        <EmptyState title="No lighting work yet">
          Once FirsThing surveys your society and commissions a demo circuit, its measured saving
          appears here.
        </EmptyState>
      ) : (
        <>
          <StatRow>
            {best ? (
              <Stat
                label="Verified saving"
                value={`${best.benchmarkSavingsPct!.toFixed(1)}%`}
                tone="ok"
                detail="measured over 5 days, before and after"
              />
            ) : (
              <StatPending label="Verified saving" detail="Once the demo circuit completes its measurement" />
            )}
            <Stat
              label="Lights covered"
              value={totalLights.toLocaleString("en-IN")}
              detail={`across ${circuits.length} circuit${circuits.length === 1 ? "" : "s"}`}
            />
            <StatPending label="Saved this month" detail="From your first released bill" />
            {contract ? (
              <Stat
                label="Your share"
                value={`${contract.revenueSharePct}%`}
                detail="of the verified saving, per your agreement"
              />
            ) : (
              <StatPending label="Your share" detail="Set when the agreement is signed" />
            )}
          </StatRow>

          {best && best.preInstallBaseline != null && (
            <Card className="mb-5 p-6">
              <CardTitle>How the {best.benchmarkSavingsPct!.toFixed(1)}% was measured</CardTitle>
              <p className="mb-4 text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Five days of metered readings before the new lights went in, five days after, on the
                same circuit and the same meter. Every figure here traces back to those readings —
                ask us for the day-by-day record at any time.
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-[var(--r-sm)] p-4" style={{ background: "var(--surface-sunken)" }}>
                  <span className="lbl">Before</span>
                  <p className="num mt-1.5 text-2xl font-bold">
                    {best.preInstallBaseline.toFixed(2)}{" "}
                    <span className="text-[13px] font-semibold" style={{ color: "var(--text-muted)" }}>
                      kWh/day
                    </span>
                  </p>
                </div>
                <div className="rounded-[var(--r-sm)] p-4" style={{ background: "var(--surface-sunken)" }}>
                  <span className="lbl">After</span>
                  <p className="num mt-1.5 text-2xl font-bold">
                    {afterKwh!.toFixed(2)}{" "}
                    <span className="text-[13px] font-semibold" style={{ color: "var(--text-muted)" }}>
                      kWh/day
                    </span>
                  </p>
                </div>
                <div
                  className="rounded-[var(--r-sm)] border p-4"
                  style={{ background: "var(--ok-bg)", borderColor: "var(--ok-line)" }}
                >
                  <span className="lbl">Saving</span>
                  <p className="num mt-1.5 text-2xl font-bold" style={{ color: "var(--ok-fg)" }}>
                    {best.benchmarkSavingsPct!.toFixed(1)}%
                  </p>
                </div>
              </div>
            </Card>
          )}

          <div className="grid items-start gap-5 lg:grid-cols-12">
            <Card className="p-6 lg:col-span-7">
              <CardTitle>Monthly bills</CardTitle>
              <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
                Each month&apos;s measured saving, and the share you keep.
              </p>
              <ChartPending
                title="Your monthly bills appear here"
                note="from the first released month onwards"
                height={170}
              />
            </Card>
            <Card className="p-6 lg:col-span-5">
              <CardTitle>Circuits</CardTitle>
              <ul className="space-y-3">
                {circuits.map((c) => (
                  <li
                    key={c.id}
                    className="border-t pt-3 first:border-t-0 first:pt-0"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="text-sm font-semibold">{c.location || c.lightType}</span>
                      {c.benchmarkSavingsPct !== null ? (
                        <StatusChip tone="ok">{c.benchmarkSavingsPct.toFixed(1)}%</StatusChip>
                      ) : (
                        <StatusChip tone="info">Commissioning</StatusChip>
                      )}
                    </div>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {c.lightType} · <span className="num">{c.representedLightCount}</span> lights
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </PortalShell>
  );
}
