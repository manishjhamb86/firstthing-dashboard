import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { TransferButton } from "./transfer-button";
import { BrandMark } from "@/components/brand-mark";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { resolveTheme } from "@/lib/resolve-theme";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
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
  const [society, accounts, sharedReports, openOffer] = await Promise.all([
    db.society.findUnique({ where: { id: societyId } }),
    db.profile.findMany({
      where: { societyId, isActive: true },
      orderBy: { name: "asc" },
    }),
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
  ]);

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

  return (
    <div className="min-h-screen">
      <div
        className="sticky top-0 z-20"
        style={{ background: "var(--chrome)", borderBottom: "1px solid var(--chrome-border)" }}
      >
        <div className="mx-auto max-w-3xl flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 sm:px-8 py-3">
          <BrandMark variant={theme === "light" ? "light" : "dark"} className="h-7" />
          <div className="flex items-center gap-4">
            <ThemeSwitcher current={theme} />
            <SignOutButton className="text-sm font-medium hover:opacity-80" style={{ color: "var(--chrome-muted)" }} />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl p-5 sm:p-8">
        <PageHeader
          title={society.name}
          subtitle={`Signed in as ${viewer.email} · ${PORTAL_AUTHORITY_LABEL[viewer.role]}`}
        />

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

        <Card className="p-6">
          <CardTitle>Portal accounts</CardTitle>
          <ul className="space-y-3">
            {accounts.map((account) => {
              const isSelf = account.id === viewer.id;
              const isTargetOfficeBearer = account.portalAuthority === "office_bearer";
              return (
                <li
                  key={account.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--border-subtle)] pt-3 first:border-t-0 first:pt-0"
                >
                  <div>
                    <p className="font-medium">
                      {account.name ?? account.email}{" "}
                      {isSelf && <span className="text-[var(--text-subtle)]">(you)</span>}
                    </p>
                    <p className="text-sm text-[var(--text-muted)]">{account.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {isTargetOfficeBearer ? (
                      <StatusChip tone="ok">Office-bearer</StatusChip>
                    ) : (
                      <StatusChip tone="neu">
                        {account.portalAuthority ? PORTAL_AUTHORITY_LABEL[account.portalAuthority] : "—"}
                      </StatusChip>
                    )}
                    {!isTargetOfficeBearer &&
                      (isOfficeBearer ? (
                        <TransferButton profileId={account.id} />
                      ) : (
                        <p className="text-xs text-[var(--text-subtle)]">Only the office-bearer can change this</p>
                      ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
