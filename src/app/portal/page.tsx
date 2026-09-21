import { redirect } from "next/navigation";
import { dealLabel } from "@/lib/deal-scope";
import { oldRecordReviewer } from "@/lib/onlooker";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { effectiveGrants } from "@/lib/portal-access";
import { societyEnergy } from "@/lib/portal-energy";
import { publishedMonthsFor } from "@/lib/published-months-loader";
import { formatDate } from "@/lib/format-date";
import { societyMeterRows } from "@/lib/meter-view";
import { societyEvents } from "@/lib/portal-notifications";
import { inspectionSummary } from "@/lib/inspection";
import { Card, CardTitle, ChartPending, PageHeader, StatusChip } from "@/components/ui";
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
import { Check, ChevronRight, FileText as FileTextIcon, Receipt, ShieldCheck, Zap, type LucideIcon } from "lucide-react";

export const dynamic = "force-dynamic";

// One KPI tile: an icon in a white bubble over a tinted card, a big figure,
// a bold label, a muted detail line. Deliberately new (not the shared
// `Stat`) — `Stat`'s own comment states this codebase's standing rule ("no
// icon variant... a green number carries no information the absence of
// amber does not already carry"), which this dashboard's canvas mockup
// explicitly overrides (user's call, 2026-09-21: "full rebuild... closer to
// the mockup's look"). Scoping the override to this one component, used only
// here, keeps every other screen's tiles exactly as that rule left them.
function KpiBubble({
  icon: Icon,
  tone,
  value,
  label,
  detail,
}: {
  icon: LucideIcon;
  tone: "ok" | "info";
  value: string;
  label: string;
  detail: string;
}) {
  const bg = tone === "ok" ? "var(--ok-bg)" : "var(--info-bg)";
  const fg = tone === "ok" ? "var(--ok-fg)" : "var(--info-fg)";
  return (
    <div className="flex flex-col gap-2.5 rounded-[var(--r-md)] p-5" style={{ background: bg }}>
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full"
        style={{ background: "var(--surface)", color: fg }}
      >
        <Icon size={17} strokeWidth={2.3} aria-hidden />
      </span>
      <p className="num text-[24px] font-extrabold leading-none tracking-[-0.02em]" style={{ color: fg }}>
        {value}
      </p>
      <p className="text-[13px] font-bold">{label}</p>
      <p className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
        {detail}
      </p>
    </div>
  );
}

// The phone mockup's own hero tile (Main.dc.html) — NOT the desktop 4-tile
// row collapsed to one column. Stacking four equal, full-detail tiles on a
// narrow screen just makes four tall cards (user-caught, 2026-09-21, with a
// side-by-side screenshot of the two): the canvas's actual phone layout is
// one prominent ₹ hero, a compact 2-up kWh/% row with no icon, then the
// health bar — a deliberately different hierarchy per breakpoint, not a
// naive reflow of the same markup.
function HeroSavedTile({ value, detail }: { value: string; detail: string }) {
  return (
    <div
      className="flex items-center gap-3.5 rounded-[var(--r-md)] p-4"
      style={{ background: "var(--ok-bg)", border: "1px solid var(--ok-line)" }}
    >
      <span
        aria-hidden
        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full text-[18px] font-extrabold"
        style={{ background: "var(--surface)", color: "var(--ok-fg)" }}
      >
        ₹
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="num text-[28px] font-extrabold leading-none tracking-[-0.02em]" style={{ color: "var(--ok-fg)" }}>
          {value}
        </p>
        <p className="text-[13.5px] font-bold">Saved this month</p>
        <p className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
          {detail}
        </p>
      </div>
    </div>
  );
}

// The 2-up kWh/% row beside it — deliberately icon-less and smaller than
// `KpiBubble`, matching the mockup's own compact treatment for these two.
function CompactTile({ tone, value, label }: { tone: "ok" | "info"; value: string; label: string }) {
  const bg = tone === "ok" ? "var(--ok-bg)" : "var(--info-bg)";
  const fg = tone === "ok" ? "var(--ok-fg)" : "var(--info-fg)";
  const line = tone === "ok" ? "var(--ok-line)" : "var(--info-line)";
  return (
    <div
      className="flex flex-col gap-1.5 rounded-[var(--r-md)] p-4"
      style={{ background: bg, border: `1px solid ${line}` }}
    >
      <p className="num text-[21px] font-extrabold leading-none" style={{ color: fg }}>
        {value}
      </p>
      <p className="text-[12.5px] font-bold">{label}</p>
    </div>
  );
}

// The mockup's fourth KPI tile — a merged meters+tanks health read in a
// distinct purple. Deliberately kept OUTSIDE the shared token system: no
// other surface in this product uses this hue, and adding it globally for
// one tile would be a bigger change than this dashboard asked for.
const HEALTH_PURPLE = { bg: "#F1EDFB", iconBg: "#5B3FB8", title: "#4A2FA5", subtitle: "#5B4E86" };

// The two highlighted rows under the phone hero (Main.dc.html) — real
// shortcuts, not the full module list the bottom tab bar's "More" sheet
// already covers, so this is two curated links, not a second nav.
function MobileQuickLink({
  icon: Icon,
  tone,
  label,
  href,
}: {
  icon: LucideIcon;
  tone: "info" | "warn";
  label: string;
  href: string;
}) {
  const bg = tone === "info" ? "var(--info-bg)" : "var(--warn-bg)";
  const fg = tone === "info" ? "var(--info-fg)" : "var(--warn-fg)";
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[var(--r-md)] border px-3.5 py-3"
      style={{ borderColor: "var(--border-subtle)", background: "var(--surface)" }}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: bg, color: fg }}>
        <Icon size={16} strokeWidth={2.2} aria-hidden />
      </span>
      <span className="flex-1 text-[14px] font-semibold">{label}</span>
      <ChevronRight size={17} style={{ color: "var(--text-subtle)" }} aria-hidden />
    </Link>
  );
}

function HealthBubble({ allReporting, summary }: { allReporting: boolean; summary: string }) {
  return (
    <div className="flex items-center gap-3.5 rounded-[var(--r-md)] p-5" style={{ background: HEALTH_PURPLE.bg }}>
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white"
        style={{ background: HEALTH_PURPLE.iconBg }}
      >
        <Check size={20} strokeWidth={3} aria-hidden />
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="text-[16px] font-extrabold" style={{ color: HEALTH_PURPLE.title }}>
          {allReporting ? "All reporting" : "Needs attention"}
        </p>
        <p className="text-[12px]" style={{ color: HEALTH_PURPLE.subtitle }}>
          System health · {summary}
        </p>
      </div>
    </div>
  );
}

// The resident dashboard (customer-portal revamp, 2026-08-29; icon-bubble
// KPI/trend/quick-actions/bottom-row layout added 2026-09-21 to match the
// design canvas): what the society has to DO first (offer, batch review —
// the acts with deadlines), then how it is doing — electricity savings and
// water health, each card rendered only for a member granted that module.
// Every query is scoped by the viewer's own societyId (INV-05), and every
// figure is either computed from stored readings exactly as the back office
// computes it, or absent with the condition that produces it stated (the
// standing no-fabrication rule).
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
  // FEAT-111 — the months the accountant has published, in rupees. Only
  // released months (CON-33); a submitted one is invisible here.
  const published = grants.has("electricity") ? await publishedMonthsFor(societyId) : null;
  const billed = published?.latest ?? null;
  const meters = grants.has("electricity") ? await societyMeterRows(societyId) : [];
  const metersOnline = meters.filter((m) => m.state === "reporting").length;
  const events = (await societyEvents(societyId)).slice(0, 4);

  // The bottom row's own two remaining cards — real rows, gated on the
  // grant that already governs their own full page (documents, billing).
  const latestInspection = grants.has("documents")
    ? await db.inspection.findFirst({
        where: { societyId, voidedAt: null, totalLightsChecked: { not: null } },
        orderBy: { inspectedAt: "desc" },
        include: { findings: { select: { id: true } } },
      })
    : null;
  const billedInvoice =
    grants.has("billing") && billed
      ? await db.billingInvoice.findFirst({
          where: { calculation: { societyId, period: billed.period, releasedAt: { not: null } }, voidedAt: null },
          select: { number: true, amount: true, dueDate: true, status: true },
        })
      : null;

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

      {/* The mobile pill row this replaced duplicated the header's own
          hamburger drawer one-for-one (same six links, same one tap away)
          and read as visual noise sitting under the greeting (user-caught,
          2026-09-21, with a screenshot: "the whole page looks bad because
          of this"). The mockup's own mobile page has nothing here either —
          its equivalent is a bottom tab bar this app doesn't have, not a
          second copy of the sidebar's links. Removed rather than restyled:
          the hamburger already does this job. */}

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
            canReview={
              viewer.id === installation.onlookerId ||
              // A day already past may be confirmed by the office-bearer (onlooker.ts).
              dayBatches.every((b) =>
                oldRecordReviewer(viewer, { plannedDate: installation.plannedDays.find((d) => d.id === b.plannedDayId)?.plannedDate ?? null }, new Date()),
              )
            }
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
              photosWaivedReason: b.photosWaivedReason,
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
              projectedSavedValue: openOffer.projectedSavedValue,
              projectedSavedKwhPerMonth: openOffer.projectedSavedKwhPerMonth,
              lightCount: ((openOffer.circuitTerms as { representedLightCount: number }[] | null) ?? []).reduce(
                (n, c) => n + c.representedLightCount,
                0,
              ),
              exclusions: (openOffer.exclusions as string[]) ?? [],
            }}
            canRespond={isOfficeBearer}
          />
        </div>
      ))}

      {/*
        Icon-bubble KPI row + "Live savings trend"/Quick actions + a bottom
        row (Latest inspection / Water tank status / Billing) — rebuilt to
        match the design canvas's dashboard closely (user's explicit call,
        2026-09-21: "full rebuild... deliberately overriding" the house
        rules `Stat`'s own comment states (no icon bubbles, no green "good"
        numbers) for this one, dashboard-scoped set of tiles. Every figure
        below is still real — the billed month's own released totals, or
        this month's own computed savings when nothing has billed yet —
        never fabricated to fill the mockup's shape.
      */}
      {energy &&
        (() => {
          const rupeesValue = billed ? billed.savedValue : null;
          const rupeesDetail = billed
            ? `You kept ₹${Math.round(billed.societyKeeps).toLocaleString("en-IN")} · paid ₹${Math.round(billed.paidToFirsthing).toLocaleString("en-IN")}`
            : "Appears once FirsThing publishes a billed month";
          const kwhValue = billed ? billed.savedKwh : energy.totals.avoidedKwh;
          const pctValue = billed ? billed.savingsPct : energy.totals.savingsPct;
          const kwhDetail = billed ? billed.basisWords : "vs before FirsThing";
          const monthLabel = billed ? monthName(billed.period) : energy.month ? monthName(energy.month) : null;
          const healthParts: string[] = [];
          if (meters.length > 0) healthParts.push(`${meters.length} meter${meters.length === 1 ? "" : "s"}`);
          if (tanks.length > 0) healthParts.push(`${tanks.length} tank${tanks.length === 1 ? "" : "s"}`);
          const allReporting =
            (meters.length === 0 || metersOnline === meters.length) &&
            (tanks.length === 0 || reporting === tanks.length) &&
            (meters.length > 0 || tanks.length > 0);

          const rupeesText = rupeesValue !== null ? `₹${Math.round(rupeesValue).toLocaleString("en-IN")}` : "—";
          const kwhText = kwhValue !== null ? `${Math.round(kwhValue).toLocaleString("en-IN")} kWh` : "—";
          const pctText = pctValue !== null ? `${pctValue.toFixed(1)}%` : "—";
          const healthSummary = healthParts.length > 0 ? healthParts.join(", ") : "no meters or tanks yet";

          return (
            <>
              {/* Phone layout — the canvas's own Main.dc.html hierarchy
                  (hero ₹ card, a compact 2-up kWh/% row, the health bar),
                  not the desktop 4-tile row simply reflowed to one column
                  (user-caught 2026-09-21, side by side with the mockup). */}
              <div className="mb-6 flex flex-col gap-3 sm:hidden">
                <HeroSavedTile value={rupeesText} detail={rupeesDetail} />
                <div className="grid grid-cols-2 gap-3">
                  <CompactTile tone="info" value={kwhText} label="Energy saved" />
                  <CompactTile tone="ok" value={pctText} label="Savings achieved" />
                </div>
                <HealthBubble allReporting={allReporting} summary={healthSummary} />
                <div className="flex flex-col gap-2">
                  <MobileQuickLink icon={Zap} tone="info" label="Electricity" href="/portal/electricity" />
                  {grants.has("billing") && (
                    <MobileQuickLink
                      icon={Receipt}
                      tone="warn"
                      label={
                        billedInvoice
                          ? `Invoice ${billedInvoice.number} · ${billedInvoice.status === "paid" ? "paid" : "pending"}`
                          : "Billing"
                      }
                      href="/portal/billing"
                    />
                  )}
                </div>
              </div>

              <div className="mb-2 hidden gap-4 sm:grid sm:grid-cols-2 xl:grid-cols-4">
                <KpiBubble
                  icon={ShieldCheck}
                  tone="ok"
                  value={rupeesText}
                  label={monthLabel ? `Saved · ${monthLabel}` : "Saved this month"}
                  detail={rupeesDetail}
                />
                <KpiBubble icon={Zap} tone="info" value={kwhText} label="Energy saved" detail={kwhDetail} />
                <KpiBubble
                  icon={FileTextIcon}
                  tone="ok"
                  value={pctText}
                  label="Savings achieved"
                  detail="vs your pre-install baseline"
                />
                <HealthBubble allReporting={allReporting} summary={healthSummary} />
              </div>
              {published?.sinceStart && published.sinceStart.months > 1 && (
                <p className="mb-6 text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
                  ₹{Math.round(published.sinceStart.savedValue).toLocaleString("en-IN")} saved across{" "}
                  {published.sinceStart.months} billed months since we started —{" "}
                  <Link href="/portal/electricity" className="font-semibold underline">
                    month by month →
                  </Link>
                </p>
              )}

              <div className="mb-6 grid items-stretch gap-5 xl:grid-cols-[1fr_300px]">
                <Card className="p-6">
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
                    <CardTitle className="mb-0">Live savings trend</CardTitle>
                    <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                      all circuits
                    </p>
                  </div>
                  {energy.daily.length === 0 ? (
                    <ChartPending
                      title="Your consumption appears here"
                      note="once the first readings are on record"
                      height={170}
                    />
                  ) : (
                    <ConsumptionChart days={energy.daily} height={170} />
                  )}
                </Card>

                {quickActions.length > 0 && (
                  <Card className="hidden p-6 lg:block">
                    <CardTitle>Quick actions</CardTitle>
                    <div className="flex flex-col gap-2">
                      {quickActions.map((e) => {
                        const Icon = PORTAL_NAV_ICONS[e.key];
                        return (
                          <Link
                            key={e.href}
                            href={e.href}
                            className="flex items-center gap-3 rounded-[var(--r-md)] border px-3.5 py-3 text-[13.5px] font-semibold"
                            style={{ borderColor: "var(--border-subtle)", background: "var(--surface-sunken)" }}
                          >
                            <span
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                              style={{ background: "var(--info-bg)", color: "var(--info-fg)" }}
                            >
                              <Icon size={15} strokeWidth={2.2} aria-hidden />
                            </span>
                            <span className="flex-1">{e.label}</span>
                            <ChevronRight size={17} style={{ color: "var(--text-subtle)" }} aria-hidden />
                          </Link>
                        );
                      })}
                    </div>
                  </Card>
                )}
              </div>
            </>
          );
        })()}

      {!energy && grants.has("water_tanks") && (
        // No electricity grant: still worth the meters+tanks health read,
        // just without the three energy tiles it would otherwise sit beside.
        <Card className="mb-6 p-5">
          <p className="lbl mb-3">System status</p>
          <div className="flex flex-wrap items-baseline gap-x-9 gap-y-3">
            {tanks.length > 0 ? (
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
            )}
            {setupCells.map((c) => (
              <span key={c.label} className="text-[13.5px]">
                <strong className="num text-[16px]">{c.avg}%</strong>{" "}
                <span style={{ color: "var(--text-subtle)" }}>avg · {c.label}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {(grants.has("documents") || (grants.has("water_tanks") && tanks.length > 0) || billedInvoice) && (
        <div className="mb-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {grants.has("documents") && (
            <Card className="p-6">
              <CardTitle>Latest inspection</CardTitle>
              {latestInspection ? (
                (() => {
                  const summary = inspectionSummary({
                    totalLightsChecked: latestInspection.totalLightsChecked ?? 0,
                    findingsCount: latestInspection.findings.length,
                  });
                  return (
                    <div className="flex flex-col gap-2">
                      <p className="num text-[15px] font-bold">{formatDate(latestInspection.inspectedAt)}</p>
                      <StatusChip tone={summary.faultyLightsCount === 0 ? "ok" : "warn"}>
                        {summary.faultyLightsCount === 0
                          ? "No issues noted"
                          : `${summary.faultyLightsCount} noted`}
                      </StatusChip>
                      <p className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
                        {summary.faultyLightsCount} of {summary.totalLightsChecked} fixtures noted
                      </p>
                      <Link href="/portal/documents" className="text-[13px] font-semibold">
                        View report →
                      </Link>
                    </div>
                  );
                })()
              ) : (
                <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                  Your first monthly inspection appears here once one is filed.
                </p>
              )}
            </Card>
          )}

          {grants.has("water_tanks") && tanks.length > 0 && (
            <Card className="p-6">
              <CardTitle>Water tank status</CardTitle>
              <p
                className="mb-3 text-[13.5px] font-bold"
                style={{ color: reporting === tanks.length ? "var(--ok-fg)" : "var(--warn-fg)" }}
              >
                {reporting === tanks.length ? "All tanks reporting" : `${reporting} of ${tanks.length} reporting`}
              </p>
              <div className="flex flex-col gap-2.5">
                {tanks.slice(0, 4).map((t) => (
                  <div key={t.id} className="flex items-center gap-3 text-[13.5px]">
                    <span className="w-20 shrink-0 truncate font-medium" title={t.name}>
                      {t.name}
                    </span>
                    <span
                      className="h-2 flex-1 overflow-hidden rounded-full"
                      style={{ background: "var(--surface-active)" }}
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${t.lastLevelPercent ?? 0}%`,
                          background: t.lastOnline ? "var(--ok-fg)" : "var(--warn-fg)",
                        }}
                      />
                    </span>
                    <span className="num w-9 shrink-0 text-right font-semibold">
                      {t.lastLevelPercent !== null ? `${t.lastLevelPercent}%` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {billedInvoice && (
            <Card className="p-6">
              <CardTitle>Billing</CardTitle>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="num text-[13px]" style={{ color: "var(--text-subtle)" }}>
                  {billedInvoice.number}
                </span>
                <StatusChip tone={billedInvoice.status === "paid" ? "ok" : "warn"}>
                  {billedInvoice.status === "paid" ? "Paid" : "Pending"}
                </StatusChip>
              </div>
              <p className="num text-[24px] font-extrabold leading-none">
                ₹{billedInvoice.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </p>
              <p className="mt-2 mb-4 text-[12px]" style={{ color: "var(--text-subtle)" }}>
                Due by {formatDate(billedInvoice.dueDate)}
              </p>
              {/* "Pay now" in the mockup — labelled honestly here instead: this
                  product has no payment gateway (portal/billing/page.tsx's own
                  stated position), so a button claiming to pay would be a real
                  functional lie, not just a visual choice. */}
              <Link
                href="/portal/billing"
                className="flex items-center justify-center gap-1.5 rounded-[10px] px-4 text-[13.5px] font-bold text-white"
                style={{ height: 42, background: "var(--ok-fg)" }}
              >
                View invoice
                <ChevronRight size={15} aria-hidden />
              </Link>
            </Card>
          )}
        </div>
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
        </div>
      </div>
    </>
  );
}
