import { Fragment } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format-date";
import { circuitName } from "@/lib/circuit-label";
import { reportTitle } from "@/lib/report-title";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { installationTally } from "@/lib/installation-tally";
import { phaseFigures } from "@/lib/installation-phases";
import { Letterhead } from "@/components/letterhead";
import { BackButton } from "@/components/back-button";
import { PrintButton } from "@/app/admin/societies/[id]/circuits/[circuitId]/reports/report-shared";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  if (!(await resolveAdmin())) return { title: "FirsThing" };
  const { id } = await params;
  const p = await db.pipeline.findUnique({ where: { id }, select: { society: { select: { name: true } } } });
  return { title: reportTitle("Work completion certificate", p?.society.name) };
}

const n = (x: number) => x.toLocaleString("en-IN");

/**
 * The work completion certificate (2026-11-26, user-asked): generated from
 * the installation record once it is marked complete — the demo circuit's
 * lights plus every logged day, who reviewed each day (optional on the
 * printout), and the society's sign-off. Rendered from the rows on every
 * open, so the paper and the record cannot disagree.
 */
export default async function WorkCompletionCertificatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reviews?: string; area?: string }>;
}) {
  const session = await requireAdminPage();
  const perms = session.user.adminPermissions ?? [];
  if (!perms.includes("manage_pipeline") && !perms.includes("manage_survey")) redirect("/admin");
  const { id } = await params;
  const sp = await searchParams;
  const showReviews = sp.reviews !== "0";
  // The area is optional (2026-11-26, user-asked): hidden unless asked for.
  const showArea = sp.area === "1";
  const cols = 3 + (showArea ? 1 : 0) + (showReviews ? 1 : 0);

  const pipeline = await db.pipeline.findUnique({
    where: { id },
    include: {
      society: true,
      agreement: { select: { signedAt: true } },
      contract: { select: { termStart: true } },
      installationProject: {
        include: {
          certificate: { include: { recordedBy: true } },
          phases: { orderBy: { number: "asc" } },
          plannedDays: { orderBy: { day: "asc" } },
          batches: {
            where: { state: { not: "draft" } },
            orderBy: [{ day: "asc" }, { submittedAt: "asc" }],
            include: { review: { include: { reviewedBy: true } }, submittedBy: true },
          },
        },
      },
    },
  });
  const project = pipeline?.installationProject;
  if (!pipeline || !project) notFound();
  // Generated once the installation is marked finished — its last phase.
  const cert = project.phases.some((ph) => ph.isFinal) ? project.certificate : null;

  const circuits = await db.circuit.findMany({
    where: { siteSurvey: { pipelineId: id }, voidedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      name: true,
      location: true,
      lightType: true,
      devices: { select: { replacementCount: true } },
      demos: { where: { voidedAt: null }, orderBy: { sequence: "asc" }, select: { lightReplacementDate: true } },
    },
  });
  const demoLines = circuits
    .map((c) => ({
      name: circuitName(c),
      count: c.devices.reduce((s, d) => s + (d.replacementCount ?? 0), 0),
      on: c.demos.find((d) => d.lightReplacementDate)?.lightReplacementDate ?? null,
    }))
    .filter((c) => c.count > 0);
  const demo = demoLines.reduce((s, c) => s + c.count, 0);

  const tally = installationTally(
    [
      ...project.plannedDays.map((d) => {
        const b = project.batches.find((x) => x.plannedDayId === d.id);
        return { plannedCount: d.plannedCount, installedCount: b ? b.installedCount : null };
      }),
      ...project.batches.filter((b) => !b.plannedDayId).map((b) => ({ plannedCount: 0, installedCount: b.installedCount })),
    ],
    demo,
    project.contractedLightCount,
  );
  const phaseRows = phaseFigures(
    project.batches.map((b) => ({ day: b.day, installedCount: b.installedCount, workedOn: b.submittedAt })),
    project.phases.map((ph) => ({ number: ph.number, throughDay: ph.throughDay, signedAt: ph.signedAt, lightsOverride: ph.lightsOverride, isFinal: ph.isFinal })),
  ).map((f) => ({ ...f, rec: project.phases.find((ph) => ph.number === f.number)! }));
  const finalPhase = phaseRows.at(-1) ?? null;
  const workDays = project.batches.filter((b) => b.submittedAt);
  const first = workDays[0]?.submittedAt ?? null;
  const last = workDays[workDays.length - 1]?.submittedAt ?? null;
  const certNo = `WCC-${(cert?.signedAt ?? new Date()).toISOString().slice(0, 4)}-${project.id.slice(-6).toUpperCase()}`;
  const hrefWith = (reviews: boolean, area: boolean) => {
    const q = [reviews ? null : "reviews=0", area ? "area=1" : null].filter(Boolean).join("&");
    return `/admin/pipeline/${id}/installation/certificate${q ? `?${q}` : ""}`;
  };
  const toggleHref = hrefWith(!showReviews, showArea);

  return (
    <div className="print-doc mx-auto max-w-[900px] p-4 sm:p-8">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <BackButton fallbackHref={`/admin/pipeline/${id}/installation`} />
        {cert && (
          <div className="flex flex-wrap items-center gap-3">
            <Link href={hrefWith(showReviews, !showArea)} className="text-sm font-semibold underline underline-offset-2">
              {showArea ? "Hide area" : "Show area"}
            </Link>
            <Link href={toggleHref} className="text-sm font-semibold underline underline-offset-2">
              {showReviews ? "Hide who reviewed each day" : "Show who reviewed each day"}
            </Link>
            <PrintButton />
          </div>
        )}
      </div>

      {!cert ? (
        <div className="card p-6">
          <h1 className="text-lg font-semibold">No certificate yet</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            The work completion certificate is generated once the installation is marked finished.{" "}
            <Link href={`/admin/pipeline/${id}/installation`} className="underline">Open the installation</Link>
          </p>
        </div>
      ) : (
        <Letterhead>
          <div className="wcc p-6 sm:p-8 print:p-0">
            <header className="text-center">
              <p className="lbl">Certificate no. <span className="num">{certNo}</span></p>
              <h1 className="mt-2 text-[26px] font-bold tracking-tight">Work Completion Certificate</h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">LED lighting retrofit{pipeline.dealScope ? ` · ${pipeline.dealScope}` : ""}</p>
            </header>

            <p className="mt-6 text-[14px] leading-relaxed">
              This is to certify that <strong>FirsThing</strong> has completed the installation of energy-efficient LED
              lighting at <strong>{pipeline.society.name}</strong>
              {pipeline.society.location ? `, ${pipeline.society.location}` : ""}
              {pipeline.agreement?.signedAt ? `, under the energy savings agreement signed on ${formatDate(pipeline.agreement.signedAt)}` : ""}.
              The work was carried out {first && last ? `between ${formatDate(first)} and ${formatDate(last)}` : "as recorded below"}, and
              each day&apos;s work was recorded and reviewed as set out below.
            </p>

            <section className="wcc-summary mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Demo installation", value: n(tally.demo), note: tally.demo === 0 ? "none on record" : demoLines.length === 1 && demoLines[0].on ? `on ${formatDate(demoLines[0].on)}` : "before the full installation" },
                { label: "Full installation", value: n(tally.installed), note: `in ${tally.daysLogged} day${tally.daysLogged === 1 ? "" : "s"}` },
                { label: "Total installed", value: n(tally.totalInstalled), note: "demo + full installation", strong: true },
                { label: "Contracted", value: n(tally.contracted), note: tally.totalInstalled >= tally.contracted ? "scope met" : `${n(tally.stillToInstall)} to go` },
              ].map((t) => (
                <div key={t.label} className="rounded-[var(--r-md)] border p-3" style={{ borderColor: t.strong ? "var(--accent-line)" : "var(--border)", background: t.strong ? "var(--accent-subtle)" : undefined }}>
                  <p className="lbl">{t.label}</p>
                  <p className="num mt-1 text-[22px] font-bold">{t.value}</p>
                  <p className="text-[12px] text-[var(--text-muted)]">{t.note}</p>
                </div>
              ))}
            </section>

            {demoLines.length > 0 && (
              <section className="mt-6">
                <h2 className="text-[15px] font-semibold">Demo installation</h2>
                <div className="print-table-scroll mt-2">
                  <table className="tbl tbl-compact">
                    <thead>
                      <tr><th>Circuit</th><th>Replaced on</th><th style={{ textAlign: "right" }}>Lights</th></tr>
                    </thead>
                    <tbody>
                      {demoLines.map((c) => (
                        <tr key={c.name}>
                          <td>{c.name}</td>
                          <td className="num">{c.on ? formatDate(c.on) : "—"}</td>
                          <td className="num" style={{ textAlign: "right" }}>{n(c.count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="mt-6">
              <h2 className="text-[15px] font-semibold">Full installation, day by day</h2>
              <div className="print-table-scroll mt-2">
                <table className="tbl tbl-compact wcc-days">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>Day</th>
                      <th style={{ width: 112 }}>Date</th>
                      {showArea && <th>Area</th>}
                      <th style={{ textAlign: "right", width: 72 }}>Lights</th>
                      {showReviews && <th style={{ width: showArea ? 230 : undefined, paddingLeft: 24 }}>Signed off by</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {project.batches.map((b, i) => {
                      // A detail that only repeats the area adds nothing
                      // (2026-11-26, user-caught: "basement · basement").
                      const detail = b.locationDetail?.trim();
                      const showDetail = !!detail && detail.toLowerCase() !== b.areaKey.trim().toLowerCase();
                      const phase = phaseRows.length > 1 ? phaseRows.find((f) => b.day <= f.throughDay) : null;
                      const prev = i > 0 ? project.batches[i - 1] : null;
                      const startsPhase = phase && (!prev || !(prev.day <= phase.throughDay && (phaseRows.find((f) => prev.day <= f.throughDay)?.number === phase.number)));
                      return (
                        <Fragment key={b.id}>
                          {startsPhase && (
                            <tr className="phase-band">
                              <td colSpan={cols}>
                                Phase {phase.number}{phase.isFinal ? " — full installation" : ""} · signed off {formatDate(phase.rec.signedAt)}
                              </td>
                            </tr>
                          )}
                          <tr>
                            <td className="num">{b.day}</td>
                            <td className="num whitespace-nowrap">{formatDate(b.submittedAt)}</td>
                            {showArea && (
                              <td>
                                {b.areaKey}
                                {showDetail && <span className="block text-[12px] leading-snug text-[var(--text-muted)]">{detail}</span>}
                              </td>
                            )}
                            <td className="num" style={{ textAlign: "right" }}>{n(b.installedCount)}</td>
                            {showReviews && (
                              <td style={{ paddingLeft: 24 }}>
                                {b.review ? (
                                  <span className="whitespace-nowrap">
                                    {b.review.decision === "approved" ? "" : "Disputed — "}
                                    {b.review.reviewedBy.name ?? b.review.reviewedBy.email}
                                    <span className="num text-[var(--text-muted)]"> · {formatDate(b.review.reviewedAt)}</span>
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                            )}
                          </tr>
                        </Fragment>
                      );
                    })}
                    {project.batches.length === 0 && (
                      <tr><td colSpan={cols} className="text-[var(--text-muted)]">No days logged.</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    {/* Full installation + the demo's lights = everything in
                        (2026-11-26, user-asked). */}
                    <tr>
                      <td colSpan={showArea ? 3 : 2}>Full installation</td>
                      <td className="num" style={{ textAlign: "right" }}>{n(tally.installed)}</td>
                      {showReviews && <td />}
                    </tr>
                    {tally.demo > 0 && (
                      <tr>
                        <td colSpan={showArea ? 3 : 2}>Demo lights</td>
                        <td className="num" style={{ textAlign: "right" }}>{n(tally.demo)}</td>
                        {showReviews && <td />}
                      </tr>
                    )}
                    <tr>
                      <td colSpan={showArea ? 3 : 2} className="font-semibold">Total installed</td>
                      <td className="num font-semibold" style={{ textAlign: "right" }}>{n(tally.totalInstalled)}</td>
                      {showReviews && <td />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            {phaseRows.length > 1 ? (
              <section className="mt-6">
                <h2 className="text-[15px] font-semibold">Completed in {phaseRows.length} phases</h2>
                <div className="print-table-scroll mt-2">
                  <table className="tbl tbl-compact">
                    <thead>
                      <tr>
                        <th>Phase</th>
                        <th style={{ textAlign: "right" }}>Installed</th>
                        <th style={{ textAlign: "right" }}>Total installed</th>
                        <th style={{ textAlign: "right" }}>Billed</th>
                        <th>Signed off</th>
                        <th>Billing from</th>
                      </tr>
                    </thead>
                    <tbody>
                      {phaseRows.map((f, i) => (
                        <tr key={f.number}>
                          <td className="whitespace-nowrap">{f.isFinal ? `Phase ${f.number} (final)` : `Phase ${f.number}`}</td>
                          {/* This phase's own lights (phase 1 carries the demo's), then the running total. */}
                          <td className="num" style={{ textAlign: "right" }}>
                            {n(i === 0 ? f.derived + tally.demo : f.derived - phaseRows[i - 1].derived)}
                          </td>
                          <td className="num" style={{ textAlign: "right" }}>{n(f.derived + tally.demo)}</td>
                          <td className="num" style={{ textAlign: "right" }}>{n(f.cumulative + tally.demo)}</td>
                          <td>
                            <span className="num block whitespace-nowrap">{formatDate(f.rec.signedAt)}</span>
                            <span className="block text-[12px] text-[var(--text-muted)]">{f.rec.signatoryName}, {f.rec.signatoryRole}</span>
                          </td>
                          <td className="num whitespace-nowrap">{formatDate(f.rec.billingStartDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : (
              finalPhase && (
                <p className="mt-6 text-[14px] leading-relaxed">
                  The completed installation was signed off on <strong>{formatDate(finalPhase.rec.signedAt)}</strong> by{" "}
                  <strong>{finalPhase.rec.signatoryName}</strong> ({finalPhase.rec.signatoryRole}) for {pipeline.society.name}. Billing
                  under the agreement starts on {formatDate(finalPhase.rec.billingStartDate)}.
                </p>
              )
            )}

            <section className="wcc-sign mt-14 grid grid-cols-2 gap-12 text-sm">
              <div>
                <div className="border-t pt-2" style={{ borderColor: "var(--text)" }}>
                  For FirsThing
                  <p className="text-[12px] text-[var(--text-muted)]">Recorded by {cert.recordedBy.name ?? cert.recordedBy.email}</p>
                </div>
              </div>
              <div>
                <div className="border-t pt-2" style={{ borderColor: "var(--text)" }}>
                  For {pipeline.society.name}
                  <p className="text-[12px] text-[var(--text-muted)]">
                    {finalPhase ? `${finalPhase.rec.signatoryName}, ${finalPhase.rec.signatoryRole}` : `${cert.signatoryName}, ${cert.signatoryRole}`}
                  </p>
                </div>
              </div>
            </section>
          </div>
        </Letterhead>
      )}
    </div>
  );
}
