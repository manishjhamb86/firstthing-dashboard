import { redirect } from "next/navigation";
import { dealLabel } from "@/lib/deal-scope";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { effectiveGrants } from "@/lib/portal-access";
import { monthlyTotals, societyEnergy } from "@/lib/portal-energy";
import { societyMeterRows } from "@/lib/meter-view";
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
import { PORTAL_NAV_ICONS, portalNavEntries } from "./portal-nav-entries";

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
  const quickActions = portalNavEntries(grants);

  const [society, sharedReports, openOffers, tanks, installations] = await Promise.all([
    db.society.findUnique({ where: { id: societyId } }),
    db.demoReport.findMany({
      where: { status: "shared", pipeline: { societyId } },
      orderBy: { version: "desc" },
      include: { pipeline: true },
    }),
    // Every part's open offer, not just the newest — a line delivered in
    // parts (CON-24 as amended) can have two deals awaiting a response at
    // once, and hiding one behind the other loses a binding decision.
    db.offer.findMany({
      where: { status: "issued", pipeline: { societyId } },
      orderBy: { version: "desc" },
      include: { pipeline: { select: { serviceLine: true, dealScope: true } } },
    }),
    db.waterTank.findMany({
      where: { societyId, hasLevelSignal: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, lastLevelPercent: true, lastOnline: true, setupType: true },
    }),
    // Same rule for installations: two parts can be mid-install at once,
    // and each day's CON-21 gate belongs to its own project.
    db.installationProject.findMany({
      where: { societyId, state: "published" },
      include: {
        onlooker: true,
        plannedDays: { orderBy: { day: "asc" } },
        batches: { orderBy: { day: "asc" } },
        pipeline: { select: { serviceLine: true, dealScope: true } },
      },
    }),
  ]);
  if (!society) redirect("/login");

  const energy = grants.has("electricity") ? await societyEnergy(societyId) : null;
  const meters = grants.has("electricity") ? await societyMeterRows(societyId) : [];
  const metersOnline = meters.filter((m) => m.state === "reporting").length;
  const events = (await societyEvents(societyId)).slice(0, 4);

  const gates = installations
    .map((installation) => {
      const awaiting = installation.batches.filter((b) => b.state === "awaiting_review");
      const awaitingDay = awaiting.length > 0 ? Math.min(...awaiting.map((b) => b.day)) : null;
      const dayBatches = awaiting.filter((b) => b.day === awaitingDay);
      const nextPlannedDay =
        installation.plannedDays.find((d) => d.day === (awaitingDay ?? 0) + 1) ?? null;
      return { installation, awaitingDay, dayBatches, nextPlannedDay };
    })
    .filter((g) => g.dayBatches.length > 0);
  const isOfficeBearer = viewer.role === "office_bearer";

  const pendingActions: string[] = [];
  for (const g of gates) {
    if (viewer.id !== g.installation.onlookerId) continue;
    const which =
      gates.length > 1
        ? ` (${dealLabel(g.installation.pipeline.serviceLine, g.installation.pipeline.dealScope)})`
        : "";
    pendingActions.push(
      `Confirm day ${g.awaitingDay ?? 1} of the installation${which}${
        g.nextPlannedDay
          ? ` — before ${reviewDeadlineFor(g.nextPlannedDay.startAt).toISOString().slice(11, 16)} UTC tomorrow`
          : ""
      }`,
    );
  }
  if (openOffers.length > 0 && isOfficeBearer) {
    pendingActions.push(
      openOffers.length === 1
        ? "Respond to the offer FirsThing has issued"
        : `Respond to the ${openOffers.length} offers FirsThing has issued`,
    );
  }

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

      {/* Mobile-only jump row: on desktop the sidebar already puts every
          granted module one click away, so a second copy here would be pure
          duplication (weighed against a reference mockup's "Quick Actions"
          idea and deliberately not built there for that reason, 2026-09-12).
          It earns its place only where the sidebar collapses behind a Menu
          toggle — `lg:hidden` matches that exact breakpoint (nav-shell.tsx),
          so this row is never visible alongside a fully open sidebar. */}
      {quickActions.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2.5 lg:hidden">
          {quickActions.map((e) => {
            const Icon = PORTAL_NAV_ICONS[e.key];
            return (
              <Link
                key={e.href}
                href={e.href}
                className="flex items-center gap-1.5 rounded-[var(--r-pill)] border px-3 py-1.5 text-[12.5px] font-semibold"
                style={{ borderColor: "var(--border-subtle)", background: "var(--surface)" }}
              >
                <Icon size={14} strokeWidth={2} style={{ color: "var(--accent)" }} aria-hidden />
                {e.label}
              </Link>
            );
          })}
        </div>
      )}

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

      {gates.map(({ installation, awaitingDay, dayBatches, nextPlannedDay }) => (
        <div className="mb-6" key={installation.id}>
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
      ))}

      {openOffers.map((openOffer) => (
        <div className="mb-6" key={openOffer.id}>
          {openOffers.length > 1 && (
            <p className="lbl mb-2">
              {dealLabel(openOffer.pipeline.serviceLine, openOffer.pipeline.dealScope)}
            </p>
          )}
          <OfferCard
            offer={{
              id: openOffer.id,
              version: openOffer.version,
              tolerancePct: openOffer.tolerancePct,
              pricingModel: openOffer.pricingModel,
              revenueSharePct: openOffer.revenueSharePct,
              lumpSumMonthlyFee: openOffer.lumpSumMonthlyFee,
              unitElectricityRate: openOffer.unitElectricityRate,
              termMonths: openOffer.termMonths,
              projectedMonthlyFee: openOffer.projectedMonthlyFee,
              exclusions: (openOffer.exclusions as string[]) ?? [],
            }}
            canRespond={isOfficeBearer}
          />
        </div>
      ))}

      {/*
        The hero, rebuilt (2026-09-12, user-asked for a genuinely bolder
        read rather than the same two cards restyled): ONE headline figure
        with its real trend against last month, not two medium cards
        repeating the same numbers at a smaller size. The month-over-month
        delta is a real computation over stored daily readings
        (monthlyTotals, src/lib/portal-energy.ts) — never a decorative
        arrow with nothing behind it.

        Deliberately still no icon bubbles and still tinting only what
        needs attention — that is a considered, documented rule
        (Stat's own comment, `src/components/ui.tsx`: "a green number
        carries no information the absence of amber does not already
        carry"), not something this pass silently undid. What is different
        is prominence and the trend, not the vocabulary.
      */}
      {energy && energy.totals.savingsPct !== null && (() => {
        const months = monthlyTotals(energy.daily);
        const idx = months.findIndex((m) => m.month === energy.month);
        const thisMonth = idx >= 0 ? months[idx] : null;
        const lastMonth = idx > 0 ? months[idx - 1] : null;
        const pctDelta =
          thisMonth && lastMonth && thisMonth.savingsPct !== null && lastMonth.savingsPct !== null
            ? thisMonth.savingsPct - lastMonth.savingsPct
            : null;
        const kwhDelta = thisMonth && lastMonth ? thisMonth.avoidedKwh - lastMonth.avoidedKwh : null;
        const deltaColor = (v: number) => (v >= 0 ? "var(--ok-fg)" : "var(--warn-fg)");
        return (
          <Card className="mb-5 p-6 sm:p-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="lbl">This month{energy.month ? ` · ${monthName(energy.month)}` : ""}</p>
              {energy.totals.band && (
                <StatusChip tone={BAND_TONE[energy.totals.band]}>
                  {SAVINGS_BAND_META[energy.totals.band].label}
                </StatusChip>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-x-12 gap-y-5">
              <div>
                <p className="flex flex-wrap items-baseline gap-2.5">
                  <span className="num text-[46px] font-bold leading-none tracking-[-0.02em]">
                    {energy.rupeesSaved !== null
                      ? `₹${Math.round(energy.rupeesSaved).toLocaleString("en-IN")}`
                      : `${energy.totals.savingsPct.toFixed(1)}%`}
                  </span>
                  <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                    {energy.rupeesSaved !== null ? "saved this month, billed" : "saved vs before FirsThing"}
                  </span>
                </p>
                {pctDelta !== null ? (
                  <p className="mt-1.5 text-[13px] font-semibold" style={{ color: deltaColor(pctDelta) }}>
                    {pctDelta >= 0 ? "↑" : "↓"} {Math.abs(pctDelta).toFixed(1)} pts vs last month
                  </p>
                ) : (
                  <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
                    A trend appears once a second month is on record
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                <span>
                  <strong className="num text-[20px]">
                    {Math.round(energy.totals.avoidedKwh ?? 0).toLocaleString("en-IN")}
                  </strong>{" "}
                  <span className="text-[13px]" style={{ color: "var(--text-subtle)" }}>
                    kWh avoided
                  </span>
                  {kwhDelta !== null && (
                    <span className="block text-[11px]" style={{ color: deltaColor(kwhDelta) }}>
                      {kwhDelta >= 0 ? "↑" : "↓"} {Math.abs(Math.round(kwhDelta)).toLocaleString("en-IN")} vs last
                      month
                    </span>
                  )}
                </span>
                <span>
                  <strong className="num text-[20px]">{energy.totals.savingsPct.toFixed(1)}%</strong>{" "}
                  <span className="text-[13px]" style={{ color: "var(--text-subtle)" }}>
                    vs before FirsThing
                  </span>
                </span>
                <span>
                  <strong className="num text-[20px]">
                    {Math.round(energy.totals.consumedKwh ?? 0).toLocaleString("en-IN")}
                  </strong>{" "}
                  <span className="text-[13px]" style={{ color: "var(--text-subtle)" }}>
                    kWh consumed
                  </span>
                </span>
              </div>
            </div>
            {energy.rupeesSaved === null && (
              <p
                className="mt-5 border-t pt-3 text-[12.5px]"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-subtle)" }}
              >
                ₹ appears once the month is billed.
              </p>
            )}
          </Card>
        );
      })()}

      {energy && energy.totals.savingsPct === null && (
        <Card className="mb-5 p-6">
          <p className="lbl mb-2">This month</p>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Your savings appear here once the first month of readings is on record.
          </p>
        </Card>
      )}

      {/* System status: meters and tanks together, one line each — merged
          from two separate cards that repeated "reporting" language twice.
          Tinted only when something needs looking at; each half states its
          own "nothing yet" independently, the same as the two cards it
          replaces did, rather than one combined fallback trying to cover
          every combination of the two. */}
      {(energy || grants.has("water_tanks")) && (
        <Card className="mb-6 p-5">
          <p className="lbl mb-3">System status</p>
          <div className="flex flex-wrap items-baseline gap-x-9 gap-y-3">
            {energy &&
              (meters.length > 0 ? (
                <span className="text-[13.5px]">
                  <strong
                    className="num text-[16px]"
                    style={metersOnline < meters.length ? { color: "var(--warn-fg)" } : undefined}
                  >
                    {metersOnline}/{meters.length}
                  </strong>{" "}
                  <span style={{ color: "var(--text-subtle)" }}>meters online</span>
                </span>
              ) : (
                <span className="text-[13px]" style={{ color: "var(--text-subtle)" }}>
                  Meters appear here once one is assigned to your circuits.
                </span>
              ))}
            {grants.has("water_tanks") &&
              (tanks.length > 0 ? (
                <span className="text-[13.5px]">
                  <strong
                    className="num text-[16px]"
                    style={reporting < tanks.length ? { color: "var(--warn-fg)" } : undefined}
                  >
                    {reporting}/{tanks.length}
                  </strong>{" "}
                  <span style={{ color: "var(--text-subtle)" }}>tanks reporting</span>
                </span>
              ) : (
                <span className="text-[13px]" style={{ color: "var(--text-subtle)" }}>
                  Levels appear here once level sensors are installed on your tanks.
                </span>
              ))}
            {setupCells.map((c) => (
              <span key={c.label} className="text-[13.5px]">
                <strong className="num text-[16px]">{c.avg}%</strong>{" "}
                <span style={{ color: "var(--text-subtle)" }}>avg · {c.label}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

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
          {/* One progress card per running installation with nothing to
              review — a gated one already has its BatchReviewCard above. */}
          {installations
            .filter((inst) => !gates.some((g) => g.installation.id === inst.id))
            .map((inst) => (
              <Card className="p-6" key={inst.id}>
                <CardTitle>
                  Installation
                  {installations.length > 1
                    ? ` — ${dealLabel(inst.pipeline.serviceLine, inst.pipeline.dealScope)}`
                    : ""}
                </CardTitle>
                <p className="text-sm">
                  Nothing to review right now —{" "}
                  {inst.batches.filter((b) => b.state === "approved").length} of{" "}
                  {new Set(inst.plannedDays.map((d) => d.day)).size} days approved,{" "}
                  <span className="num">{inst.batches.reduce((n, b) => n + b.installedCount, 0)}</span> of{" "}
                  <span className="num">{inst.contractedLightCount}</span> fittings installed.
                </p>
              </Card>
            ))}
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
