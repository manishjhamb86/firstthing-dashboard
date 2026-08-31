import { redirect } from "next/navigation";
import { dealLabel } from "@/lib/deal-scope";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { effectiveGrants } from "@/lib/portal-access";
import { societyEnergy } from "@/lib/portal-energy";
import { societyEvents } from "@/lib/portal-notifications";
import { Card, CardTitle, ChartPending, PageHeader, StatusChip } from "@/components/ui";
import { SAVINGS_BAND_META } from "@/lib/circuit-load";
import { TankVisual } from "@/components/tank-visual";
import Link from "next/link";
import { PORTAL_AUTHORITY_LABEL } from "@/lib/status-maps";
import { DemoReportView } from "@/components/demo-report-view";
import { OfferCard } from "./offer-card";
import { BatchReviewCard } from "./batch-review-card";
import { reviewDeadlineFor } from "@/lib/installation-gate";
import { publicS3Url } from "@/lib/s3";
import { BAND_TONE, monthName, timeAgoShort } from "./portal-widgets";
import { ConsumptionChart } from "./consumption-chart";

export const dynamic = "force-dynamic";

// The resident dashboard (customer-portal revamp, 2026-08-29): what the
// society has to DO first (offer, batch review — the acts with deadlines),
// then how it is doing — electricity savings and water health, each card
// rendered only for a member granted that module. Every query is scoped by
// the viewer's own societyId (INV-05), and every figure is either computed
// from stored readings exactly as the back office computes it, or absent
// with the condition that produces it stated (the standing no-fabrication
// rule).
export default async function PortalHomePage() {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);
  const societyId = viewer.societyId;
  const grants = effectiveGrants(viewer.role, viewer.grants);

  const [society, sharedReports, openOffer, tanks, installation] = await Promise.all([
    db.society.findUnique({ where: { id: societyId } }),
    db.demoReport.findMany({
      where: { status: "shared", pipeline: { societyId } },
      orderBy: { version: "desc" },
      include: { pipeline: true },
    }),
    db.offer.findFirst({
      where: { status: "issued", pipeline: { societyId } },
      orderBy: { version: "desc" },
    }),
    db.waterTank.findMany({
      where: { societyId, hasLevelSignal: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, lastLevelPercent: true, lastOnline: true, setupType: true },
    }),
    db.installationProject.findFirst({
      where: { societyId, state: "published" },
      include: {
        onlooker: true,
        plannedDays: { orderBy: { day: "asc" } },
        batches: { orderBy: { day: "asc" } },
      },
    }),
  ]);
  if (!society) redirect("/login");

  const energy = grants.has("electricity") ? await societyEnergy(societyId) : null;
  const events = (await societyEvents(societyId)).slice(0, 4);

  const awaiting = installation?.batches.filter((b) => b.state === "awaiting_review") ?? [];
  const awaitingDay = awaiting.length > 0 ? Math.min(...awaiting.map((b) => b.day)) : null;
  const dayBatches = awaiting.filter((b) => b.day === awaitingDay);
  const nextPlannedDay = installation?.plannedDays.find((d) => d.day === (awaitingDay ?? 0) + 1) ?? null;
  const isOfficeBearer = viewer.role === "office_bearer";

  const pendingActions: string[] = [];
  if (installation && dayBatches.length > 0 && viewer.id === installation.onlookerId) {
    pendingActions.push(
      `Confirm day ${awaitingDay ?? 1} of the installation${
        nextPlannedDay
          ? ` — before ${reviewDeadlineFor(nextPlannedDay.startAt).toISOString().slice(11, 16)} UTC tomorrow`
          : ""
      }`,
    );
  }
  if (openOffer && isOfficeBearer) pendingActions.push("Respond to the offer FirsThing has issued");

  const reporting = tanks.filter((t) => t.lastOnline).length;
  const setupAvg = (setup: "domestic" | "flush" | "stp") => {
    const of = tanks.filter((t) => t.setupType === setup && t.lastLevelPercent !== null);
    if (of.length === 0) return null;
    return Math.round(of.reduce((s, t) => s + (t.lastLevelPercent ?? 0), 0) / of.length);
  };
  const setupCells = [
    { label: "Domestic", avg: setupAvg("domestic") },
    { label: "Flush", avg: setupAvg("flush") },
    { label: "STP", avg: setupAvg("stp") },
  ].filter((c) => c.avg !== null);

  const first = (viewer.name ?? viewer.email).split(/[@\s]/)[0];

  return (
    <>
      <PageHeader
        title={`Good day, ${first}`}
        subtitle={`${society.name} · you are ${PORTAL_AUTHORITY_LABEL[viewer.role].toLowerCase()}`}
        chip={
          pendingActions.length > 0 ? (
            <StatusChip tone="warn">{pendingActions.length} awaiting you</StatusChip>
          ) : (
            <StatusChip tone="ok">Nothing needs you</StatusChip>
          )
        }
      />

      {pendingActions.length > 0 && (
        <div
          className="mb-6 rounded-[var(--r-md)] border p-4"
          style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" }}
        >
          <p className="text-sm font-semibold mb-1">
            {pendingActions.length === 1 ? "One thing needs you" : `${pendingActions.length} things need you`}
          </p>
          <ul className="text-sm list-disc pl-5 space-y-0.5">
            {pendingActions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {installation && dayBatches.length > 0 && (
        <div className="mb-6">
          <BatchReviewCard
            dayNumber={awaitingDay ?? 1}
            totalDays={new Set(installation.plannedDays.map((d) => d.day)).size}
            totalPlanned={installation.contractedLightCount}
            totalInstalledToDate={installation.batches.reduce((n, b) => n + b.installedCount, 0)}
            deadlineIso={nextPlannedDay ? reviewDeadlineFor(nextPlannedDay.startAt).toISOString() : null}
            canReview={viewer.id === installation.onlookerId}
            onlookerName={installation.onlooker.name ?? installation.onlooker.email}
            batches={dayBatches.map((b) => ({
              id: b.id,
              day: b.day,
              areaKey: b.areaKey,
              locationDetail: b.locationDetail,
              installedCount: b.installedCount,
              skippedCount: b.skippedCount,
              skippedReason: b.skippedReason,
              submittedAt: b.submittedAt?.toISOString() ?? null,
              photoUrls: ((b.photoKeys as string[]) ?? []).map(publicS3Url),
            }))}
          />
        </div>
      )}

      {openOffer && (
        <div className="mb-6">
          <OfferCard
            offer={{
              id: openOffer.id,
              version: openOffer.version,
              tolerancePct: openOffer.tolerancePct,
              revenueSharePct: openOffer.revenueSharePct,
              unitElectricityRate: openOffer.unitElectricityRate,
              termMonths: openOffer.termMonths,
              projectedMonthlyFee: openOffer.projectedMonthlyFee,
              exclusions: (openOffer.exclusions as string[]) ?? [],
            }}
            canRespond={isOfficeBearer}
          />
        </div>
      )}

      {/* The hero: how the society is doing, one card per granted module. */}
      <div className="mb-6 grid items-stretch gap-5 lg:grid-cols-2">
        {energy && (
          <Card className="p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="lbl">
                Electricity savings{energy.month ? ` · ${monthName(energy.month)}` : ""}
              </p>
              {energy.totals.band && (
                <StatusChip tone={BAND_TONE[energy.totals.band]}>
                  {SAVINGS_BAND_META[energy.totals.band].label}
                </StatusChip>
              )}
            </div>
            {energy.totals.savingsPct === null ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Your savings appear here once the first month of readings is on record.
              </p>
            ) : (
              <>
                <p className="flex flex-wrap items-baseline gap-2.5">
                  <span className="num text-[38px] font-bold leading-none tracking-[-0.02em]">
                    {energy.totals.savingsPct.toFixed(1)}%
                  </span>
                  <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                    vs what the same lights drew before FirsThing
                  </span>
                </p>
                <div
                  className="mt-4 flex flex-wrap gap-x-7 gap-y-2 border-t pt-3.5 text-[13px]"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <span>
                    <strong className="num text-[16px]">
                      {Math.round(energy.totals.avoidedKwh ?? 0).toLocaleString("en-IN")}
                    </strong>{" "}
                    <span style={{ color: "var(--text-subtle)" }}>kWh avoided</span>
                  </span>
                  <span>
                    <strong className="num text-[16px]">
                      {Math.round(energy.totals.consumedKwh ?? 0).toLocaleString("en-IN")}
                    </strong>{" "}
                    <span style={{ color: "var(--text-subtle)" }}>kWh consumed</span>
                  </span>
                  <span>
                    {energy.rupeesSaved !== null ? (
                      <>
                        <strong className="num text-[16px]">
                          ₹{Math.round(energy.rupeesSaved).toLocaleString("en-IN")}
                        </strong>{" "}
                        <span style={{ color: "var(--text-subtle)" }}>saved (billed)</span>
                      </>
                    ) : (
                      <span style={{ color: "var(--text-subtle)" }}>₹ appears once the month is billed</span>
                    )}
                  </span>
                </div>
              </>
            )}
          </Card>
        )}
        {grants.has("water_tanks") && (
          <Card className="p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="lbl">Water monitoring</p>
              {tanks.length > 0 &&
                (reporting === tanks.length ? (
                  <StatusChip tone="ok">All tanks reporting</StatusChip>
                ) : (
                  <StatusChip tone="warn">
                    {tanks.length - reporting} not reporting
                  </StatusChip>
                ))}
            </div>
            {tanks.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Levels appear here once level sensors are installed on your tanks.
              </p>
            ) : (
              <>
                <p className="flex flex-wrap items-baseline gap-2.5">
                  <span className="num text-[38px] font-bold leading-none tracking-[-0.02em]">
                    {reporting}
                    <span style={{ color: "var(--text-subtle)", fontWeight: 500 }}>/{tanks.length}</span>
                  </span>
                  <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                    tanks reporting right now
                  </span>
                </p>
                <div
                  className="mt-4 flex flex-wrap gap-x-7 gap-y-2 border-t pt-3.5 text-[13px]"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  {setupCells.length > 0 ? (
                    setupCells.map((c) => (
                      <span key={c.label}>
                        <strong className="num text-[16px]">{c.avg}%</strong>{" "}
                        <span style={{ color: "var(--text-subtle)" }}>avg · {c.label}</span>
                      </span>
                    ))
                  ) : (
                    <span style={{ color: "var(--text-subtle)" }}>
                      Group averages appear once tanks are classified by setup
                    </span>
                  )}
                </div>
              </>
            )}
          </Card>
        )}
      </div>

      {energy && (
        <Card className="mb-6 p-6">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
            <CardTitle className="mb-0">Consumption</CardTitle>
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
              all circuits
            </p>
          </div>
          {energy.daily.length === 0 ? (
            <ChartPending
              title="Your consumption appears here"
              note="once the first readings are on record"
              height={150}
            />
          ) : (
            <ConsumptionChart days={energy.daily} height={170} />
          )}
        </Card>
      )}

      <div className="mb-6 grid items-start gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7 min-w-0 flex flex-col gap-5">
          {/* One card per DEAL's latest shared report (CON-24 as amended:
              a line delivered in parts has one report per part, and showing
              only the newest hid the sibling's). The query is version-desc,
              so first-seen per pipeline is that deal's latest version. */}
          {[...new Map(sharedReports.map((r) => [r.pipelineId, r])).values()].map((report, i, all) => (
            <Card key={report.id} className="p-6">
              <CardTitle>
                Your demo savings report
                {all.length > 1 ? ` — ${dealLabel(report.pipeline.serviceLine, report.pipeline.dealScope)}` : ""}
              </CardTitle>
              <p className="mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
                Measured on the metered demo circuits, with the daily readings behind every figure.
              </p>
              <DemoReportView report={report} />
            </Card>
          ))}
        </div>
        <div className="lg:col-span-5 min-w-0 flex flex-col gap-5">
          {energy && energy.circuits.length > 0 && (
            <Card className="p-6">
              <CardTitle>Your circuits</CardTitle>
              <div className="flex flex-col gap-3">
                {energy.circuits.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-sm)] border px-3.5 py-3"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <div>
                      <p className="text-[13.5px] font-semibold">
                        {c.label} · {c.lightCount} LED lights
                      </p>
                      <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                        {c.monthDailyAvg !== null
                          ? `${c.monthDailyAvg.toFixed(1)} kWh/day over ${c.monthDays} recorded day${c.monthDays === 1 ? "" : "s"}`
                          : "no readings this month yet"}
                      </p>
                    </div>
                    {c.savingsPct !== null && c.band && (
                      <StatusChip tone={BAND_TONE[c.band]}>{c.savingsPct.toFixed(1)}% saved</StatusChip>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-right">
                <Link href="/portal/electricity" className="text-[13px] font-semibold">
                  Circuit-wise details →
                </Link>
              </p>
            </Card>
          )}
          {installation && dayBatches.length === 0 && (
            <Card className="p-6">
              <CardTitle>Installation</CardTitle>
              <p className="text-sm">
                Nothing to review right now —{" "}
                {installation.batches.filter((b) => b.state === "approved").length} of{" "}
                {new Set(installation.plannedDays.map((d) => d.day)).size} days approved,{" "}
                <span className="num">{installation.batches.reduce((n, b) => n + b.installedCount, 0)}</span> of{" "}
                <span className="num">{installation.contractedLightCount}</span> fittings installed.
              </p>
            </Card>
          )}
          <Card className="p-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <CardTitle className="mb-0">Recent activity</CardTitle>
              <Link href="/portal/notifications" className="text-[13px] font-semibold">
                View all →
              </Link>
            </div>
            {events.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                Nothing yet — reports, sensor trouble and ticket updates appear here.
              </p>
            ) : (
              <div className="flex flex-col">
                {events.map((e, i) => (
                  <div
                    key={e.id}
                    className="flex gap-2.5 py-2.5"
                    style={i < events.length - 1 ? { borderBottom: "1px solid var(--border-subtle)" } : undefined}
                  >
                    <span
                      aria-hidden
                      className="mt-1.5 h-[7px] w-[7px] flex-shrink-0 rounded-full"
                      style={{
                        background:
                          e.tone === "warn"
                            ? "var(--warn-fg)"
                            : e.tone === "ok"
                              ? "var(--ok-fg)"
                              : e.tone === "info"
                                ? "var(--accent)"
                                : "var(--neu-fg)",
                      }}
                    />
                    <div className="min-w-0">
                      <p className="text-[13px] leading-snug">{e.title}</p>
                      <p className="text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                        {timeAgoShort(e.at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          {grants.has("water_tanks") && tanks.length > 0 && (
            <Card className="p-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <CardTitle className="mb-0">Your tanks</CardTitle>
                <Link href="/portal/tanks" className="text-[13px] font-semibold">
                  See all →
                </Link>
              </div>
              <div className="flex flex-wrap justify-center gap-4">
                {tanks.slice(0, 3).map((t) => (
                  <div key={t.id} className="flex flex-col items-center gap-2">
                    <TankVisual
                      pct={t.lastLevelPercent ?? 0}
                      offline={!t.lastOnline}
                      width={84}
                      height={116}
                      pctSize={20}
                      ticks={false}
                    />
                    <span className="max-w-[96px] text-center text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {t.name}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

      </div>
    </>
  );
}
