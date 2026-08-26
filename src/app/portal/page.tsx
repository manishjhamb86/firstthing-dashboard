import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { resolveTheme } from "@/lib/resolve-theme";
import {
  Card,
  CardTitle,
  ChartPending,
  PageHeader,
  Stat,
  StatPending,
  StatRow,
  StatusChip,
} from "@/components/ui";
import { PortalShell } from "./portal-shell";
import { TankVisual } from "@/components/tank-visual";
import Link from "next/link";
import { PORTAL_AUTHORITY_LABEL } from "@/lib/status-maps";
import { DemoReportView } from "@/components/demo-report-view";
import { OfferCard } from "./offer-card";
import { BatchReviewCard } from "./batch-review-card";
import { reviewDeadlineFor } from "@/lib/installation-gate";
import { publicS3Url } from "@/lib/s3";

// MS-02's demoable outcome, made literal: a society office-bearer/committee/
// manager account logs in and lands on a role-scoped page reading its own
// society's data (INV-05), with one real binding act (FEAT-108-AC-5,
// GATE-04) — transferring the office-bearer designation — available only to
// the account that actually holds it, checked server-side in actions.ts, not
// just by this page choosing not to render the button.
export default async function PortalHomePage() {
  // Resolved from the Profile row, not the token — see src/lib/portal-viewer.ts:
  // the authority this page renders for must be the one in force now, or the
  // screen and the Server Action disagree about who may act.
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);

  const societyId = viewer.societyId;
  const [society, sharedReports, openOffer, tanks, benchmarked] = await Promise.all([
    db.society.findUnique({ where: { id: societyId } }),
    // INV-05 — scoped to this viewer's own society, server-side. FEAT-020-AC-4
    // is the other half: `status: "shared"` is a hard filter here, so a draft
    // is not merely un-linked from the portal, it is unreachable through it.
    db.demoReport.findMany({
      where: { status: "shared", pipeline: { societyId } },
      orderBy: { version: "desc" },
      include: { pipeline: true },
    }),
    // Only an *issued* offer is ever visible to the society — a draft the
    // back office is still editing is not theirs to see. INV-05 scopes it
    // to their own society server-side, as with everything else here.
    db.offer.findFirst({
      where: { status: "issued", pipeline: { societyId } },
      orderBy: { version: "desc" },
    }),
    // The society's own tanks and its best verified benchmark — both scoped
    // server-side like everything else here (INV-05).
    db.waterTank.findMany({
      where: { societyId, hasLevelSignal: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, lastLevelPercent: true, lastOnline: true },
    }),
    db.circuit.findFirst({
      where: { societyId, voidedAt: null, benchmarkSavingsPct: { not: null } },
      orderBy: { benchmarkSavingsPct: "desc" },
      select: { benchmarkSavingsPct: true },
    }),
  ]);
  const benchmarkPct = benchmarked?.benchmarkSavingsPct ?? null;

  if (!society) redirect("/login");

  // FEAT-035 — the day awaiting the society's review, if there is one. Scoped
  // to this society server-side like everything else on this page (INV-05).
  const installation = await db.installationProject.findFirst({
    where: { societyId, state: "published" },
    include: {
      onlooker: true,
      plannedDays: { orderBy: { day: "asc" } },
      batches: { orderBy: { day: "asc" } },
    },
  });
  const awaiting = installation?.batches.filter((b) => b.state === "awaiting_review") ?? [];
  // A day is reviewed as one thing even when several technicians worked it in
  // parallel (CON-44) — take the earliest outstanding day, not every day at
  // once, so the society is never asked two questions where one will do.
  const awaitingDay = awaiting.length > 0 ? Math.min(...awaiting.map((b) => b.day)) : null;
  const dayBatches = awaiting.filter((b) => b.day === awaitingDay);
  const nextPlannedDay = installation?.plannedDays.find((d) => d.day === (awaitingDay ?? 0) + 1) ?? null;

  const isOfficeBearer = viewer.role === "office_bearer";
  const theme = await resolveTheme();

  // Only acts this viewer can actually perform count as needing them — the
  // committee member who cannot accept an offer is not being told to.
  const pendingActions: string[] = [];
  if (installation && dayBatches.length > 0 && viewer.id === installation.onlookerId) {
    pendingActions.push(
      `Confirm day ${awaitingDay ?? 1} of the installation${
        nextPlannedDay ? ` — before ${reviewDeadlineFor(nextPlannedDay.startAt).toISOString().slice(11, 16)} UTC tomorrow` : ""
      }`,
    );
  }
  if (openOffer && isOfficeBearer) pendingActions.push("Respond to the offer FirsThing has issued");

  return (
    <PortalShell theme={theme} email={viewer.email} societyName={society.name}>
      <PageHeader
        title={society.name}
        subtitle={`Your society's account with FirsThing · you are ${PORTAL_AUTHORITY_LABEL[viewer.role].toLowerCase()}`}
        chip={
          pendingActions.length > 0 ? (
            <StatusChip tone="warn">{pendingActions.length} awaiting you</StatusChip>
          ) : (
            <StatusChip tone="ok">Nothing needs you</StatusChip>
          )
        }
      />

      {/* The society's own numbers. Empty where the feature that produces
          them is not built (the user's explicit choice 2026-08-25: visible,
          named, never a fabricated figure). */}
      <StatRow>
        <StatPending label="Saved this month" detail="From your first released bill" />
        {benchmarkPct !== null ? (
          <Stat label="Verified saving" value={`${benchmarkPct.toFixed(1)}%`} tone="ok" detail="on your demo circuit" />
        ) : (
          <StatPending label="Verified saving" detail="Once the demo circuit completes" />
        )}
        {tanks.length > 0 ? (
          <Stat
            label="Water tanks"
            value={`${tanks.filter((t) => t.lastOnline).length} of ${tanks.length}`}
            detail="reporting right now"
          />
        ) : (
          <StatPending label="Water tanks" detail="Once level sensors are installed" />
        )}
        <StatPending label="Electricity used" detail="Once monthly readings are ingested" />
      </StatRow>

        {/* What the society actually has to DO, before anything it merely
            needs to know. The batch review carries a three-hour deadline —
            miss it and a crew cannot start tomorrow — and it used to sit
            below a full savings report. Ordering by urgency is the whole
            point; the callout just says out loud what the order implies. */}
        {pendingActions.length > 0 && (
          <div
            className="mb-8 rounded-[var(--r-md)] border p-4"
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

        {/* CON-21's gate, from the society's side. Highest-stakes routine
            screen on this surface: not approved 3 hours before tomorrow's
            start and a crew of technicians cannot begin. */}
        {installation && dayBatches.length > 0 && (
          <div className="mb-8">
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
          <div className="mb-8">
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

        {/* MS-05's first exit criterion: the society sees its demo report in
            its own portal. Only shared versions ever reach here. */}
        {sharedReports.length > 0 && (
          <section className="mb-8">
            <h2 className="text-[15px] font-semibold mb-1">Your demo savings report</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Measured on the metered demo circuits, with the daily readings behind every figure.
            </p>
            <DemoReportView report={sharedReports[0]} />
          </section>
        )}

        {/* FEAT-035-AC-2 — a caught-up state, not a blank space. */}
        {installation && dayBatches.length === 0 && (
          <div className="mb-8">
            <Card className="p-6">
              <CardTitle>Installation</CardTitle>
              <p className="text-sm">
                Nothing to review right now — {installation.batches.filter((b) => b.state === "approved").length} of{" "}
                {new Set(installation.plannedDays.map((d) => d.day)).size} days approved,{" "}
                <span className="num">{installation.batches.reduce((n, b) => n + b.installedCount, 0)}</span> of{" "}
                <span className="num">{installation.contractedLightCount}</span> fittings installed. We&apos;ll email
                you each evening when there is a day to confirm.
              </p>
            </Card>
          </div>
        )}

      <div className="mb-5 grid items-start gap-5 lg:grid-cols-12">
        <Card className="p-6 lg:col-span-7">
          <CardTitle>Your electricity, month by month</CardTitle>
          <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
            What the common-area lighting used, against what it used before the retrofit.
          </p>
          <ChartPending
            title="Your consumption appears here"
            note="once your first month is calculated"
            height={170}
          />
        </Card>
        <Card className="p-6 lg:col-span-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <CardTitle className="mb-0">Your tanks</CardTitle>
            {tanks.length > 0 && (
              <Link href="/portal/tanks" className="text-[13px] font-semibold">
                See all →
              </Link>
            )}
          </div>
          {tanks.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              No level sensors on your tanks yet.
            </p>
          ) : (
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
          )}
        </Card>
      </div>

      {/* The committee list lives on its own tab now — a second copy here
          was the same list twice, and the tab is where adding and removing
          happen. */}
    </PortalShell>
  );
}
