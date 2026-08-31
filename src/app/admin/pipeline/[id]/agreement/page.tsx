import { formatDate } from "@/lib/format-date";
import { dealLabel } from "@/lib/deal-scope";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { CONTRACT_STATUS, statusMeta } from "@/lib/status-maps";
import { publicS3Url } from "@/lib/s3";
import {
  ActivateContractForm,
  ExecutedUploadForm,
  PrepareAgreementButton,
  StepButton,
} from "./agreement-controls";

function stepChip(done: Date | null) {
  return done ? (
    <StatusChip tone="ok">{formatDate(done)}</StatusChip>
  ) : (
    <StatusChip tone="warn">Outstanding</StatusChip>
  );
}

export default async function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminPage();
  if (!session.user.adminPermissions?.includes("manage_pipeline")) redirect("/admin/pipeline");
  const canEdit =
    session.user.adminPermissions.includes("manage_survey") &&
    session.user.adminPermissions.includes("manage_pipeline");

  const { id } = await params;
  const pipeline = await db.pipeline.findUnique({
    where: { id },
    include: {
      society: true,
      agreement: { include: { offer: true, preparedBy: true, uploadedBy: true } },
      contract: { include: { versions: { orderBy: { version: "desc" } }, activatedBy: true } },
      // GATE-01's two preconditions, so the empty state can say which one is
      // missing instead of describing both as prose.
      offers: { orderBy: { version: "desc" }, take: 1, select: { status: true } },
      kycRequirements: { select: { status: true } },
    },
  });
  if (!pipeline) notFound();

  const agreement = pipeline.agreement;
  const contract = pipeline.contract;
  const contractStatus = contract ? statusMeta(CONTRACT_STATUS, contract.status) : null;
  const currentTerms = contract?.versions[0] ?? null;
  const offerAccepted = pipeline.offers[0]?.status === "accepted";
  const kycTotal = pipeline.kycRequirements.length;
  const kycSettled = pipeline.kycRequirements.filter(
    (k) => k.status === "verified" || k.status === "not_applicable",
  ).length;
  const kycDone = kycTotal > 0 && kycSettled >= kycTotal;
  const canPrepare = offerAccepted && kycDone;

  return (
    <>
      <PageHeader
        backHref={`/admin/pipeline/${pipeline.id}`}
        title="Agreement & contract"
        chip={contractStatus ? <StatusChip tone={contractStatus.tone}>{contractStatus.label}</StatusChip> : undefined}
        subtitle={`${dealLabel(pipeline.serviceLine, pipeline.dealScope)} · prepared from the accepted offer`}
        // Top right, and only once there is an agreement to print — it was
        // buried under the execution table, where a document you may need at
        // any point in the flow is the hardest thing to find.
        action={
          agreement ? (
            <Link href={`/admin/pipeline/${pipeline.id}/agreement/print`} className="btn-secondary btn-sm">
              Open the printable agreement
            </Link>
          ) : undefined
        }
      />

      {!agreement ? (
        <div className="max-w-none space-y-4">
          {/* FEAT-029-AC-2 — what's outstanding, as discrete steps. */}
          {/* Which precondition is missing, and where it is met — the prose
              version named both and pointed at neither, so the only way to
              find out was to press the button and read a refusal. */}
          <EmptyState title="No agreement prepared yet">
            <p>
              It is prepared from exactly the terms the society accepted, then printed, notarized,
              signed and scanned back in. Two things have to be true first:
            </p>
            <ul className="mt-3 text-left inline-block space-y-1.5">
              <li>
                {offerAccepted ? "✓" : "•"} The society has accepted an offer
                {!offerAccepted && (
                  <>
                    {" — "}
                    <Link href={`/admin/pipeline/${pipeline.id}/offer`} className="underline font-medium">
                      Open the offer →
                    </Link>
                  </>
                )}
              </li>
              <li>
                {kycDone ? "✓" : "•"} KYC is settled (GATE-01)
                {!kycDone && (
                  <>
                    {kycTotal > 0 ? ` — ${kycSettled} of ${kycTotal} settled. ` : " — nothing collected yet. "}
                    <Link href={`/admin/pipeline/${pipeline.id}/kyc`} className="underline font-medium">
                      Open KYC →
                    </Link>
                  </>
                )}
              </li>
            </ul>
          </EmptyState>
          {canEdit && canPrepare && <PrepareAgreementButton pipelineId={pipeline.id} />}
          {canEdit && !canPrepare && (
            <p className="text-sm text-[var(--text-muted)]">
              Preparing the agreement unlocks once both are done.
            </p>
          )}
        </div>
      ) : (
        <div className="max-w-none space-y-6">
          {/* The upload IS the last execution step, so it sits beside the
              list rather than below it — user-asked 2026-08-20. Stacks back
              to one column under lg, where side-by-side would only squeeze
              both. */}
          <div className="grid gap-6 lg:grid-cols-2 items-start [&>*]:min-w-0">
          <Card className="p-5">
            <CardTitle>Execution steps</CardTitle>
            <p className="text-sm text-[var(--text-muted)] mt-1 mb-4">
              Prepared {formatDate(agreement.preparedAt)} by{" "}
              {agreement.preparedBy.name ?? agreement.preparedBy.email}.
            </p>
            <div className="overflow-x-auto">
              <table className="tbl">
                <tbody>
                  <tr>
                    <td>Printed</td>
                    <td>{stepChip(agreement.printedAt)}</td>
                    <td>
                      {canEdit && !agreement.printedAt && (
                        <StepButton pipelineId={pipeline.id} step="printed" label="Mark printed" />
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td>Notarized</td>
                    <td>{stepChip(agreement.notarizedAt)}</td>
                    <td>
                      {canEdit && !agreement.notarizedAt && (
                        <StepButton
                          pipelineId={pipeline.id}
                          step="notarized"
                          label="Mark notarized"
                          disabled={!agreement.printedAt}
                        />
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td>Signed</td>
                    <td>{stepChip(agreement.signedAt)}</td>
                    <td>
                      {canEdit && !agreement.signedAt && (
                        <StepButton
                          pipelineId={pipeline.id}
                          step="signed"
                          label="Mark signed"
                          disabled={!agreement.notarizedAt}
                        />
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td>Executed scan uploaded</td>
                    <td>{stepChip(agreement.uploadedAt)}</td>
                    <td>
                      {agreement.executedS3Key && (
                        <a
                          href={publicS3Url(agreement.executedS3Key)}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline text-sm"
                        >
                          {agreement.executedFileName}
                        </a>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

          </Card>

          {/* One column, one act: whatever the execution steps are waiting
              for. The upload while the scan is outstanding, then activation
              takes its place rather than reappearing at the foot of the page
              (user-asked 2026-08-20). */}
          {canEdit && !agreement.executedS3Key ? (
            <Card className="p-5">
              <CardTitle>Upload the executed agreement</CardTitle>
              <p className="text-sm text-[var(--text-muted)] mt-1 mb-4">
                A hard gate — the deal cannot advance to installation without it, because installation
                commits FirsThing&apos;s own capital.
              </p>
              <ExecutedUploadForm pipelineId={pipeline.id} societyName={pipeline.society.name} />
            </Card>
          ) : canEdit && !contract ? (
            <Card className="p-5">
              <CardTitle>Activate the contract</CardTitle>
              <p className="text-sm text-[var(--text-muted)] mt-1 mb-4">
                Carries the accepted offer&apos;s terms — tolerance, revenue share, unit rate,
                exclusions, spare stock and the per-circuit benchmark table — as version 1.
              </p>
              <ActivateContractForm pipelineId={pipeline.id} />
            </Card>
          ) : contract ? (
            // The column carries whatever this stage is about: the upload,
            // then the activation, then the contract it produced. Dropping
            // the contract below left the right-hand space empty beside it.

            <Card className="p-5">
              <CardTitle>Contract</CardTitle>
              <p className="text-sm text-[var(--text-muted)] mt-1 mb-4">
                Activated {formatDate(contract.activatedAt)} by{" "}
                {contract.activatedBy?.name ?? contract.activatedBy?.email ?? "—"} · term{" "}
                {formatDate(contract.termStart)} → {formatDate(contract.termEnd)}
              </p>
              {currentTerms && (
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 text-sm">
                  <div>
                    <dt className="lbl">Revenue share</dt>
                    <dd className="num">
                      {currentTerms.revenueSharePct}% society / {100 - currentTerms.revenueSharePct}% FirsThing
                    </dd>
                  </div>
                  <div>
                    <dt className="lbl">Tolerance band</dt>
                    <dd className="num">±{currentTerms.tolerancePct}%</dd>
                  </div>
                  <div>
                    <dt className="lbl">Unit rate</dt>
                    <dd className="num">₹{currentTerms.unitElectricityRate.toFixed(2)}/kWh</dd>
                  </div>
                  <div>
                    <dt className="lbl">Spare stock</dt>
                    <dd className="num">{currentTerms.spareStockCount}</dd>
                  </div>
                  <div>
                    <dt className="lbl">Terms version</dt>
                    <dd className="num">
                      v{currentTerms.version}, effective {formatDate(currentTerms.effectiveFrom)}
                    </dd>
                  </div>
                </dl>
              )}
              <p className="text-sm text-[var(--text-muted)] mt-4">
                Terms are versioned and effective-dated: an amendment applies forward only, and a prior month
                stays computed against the version in force at the time.
              </p>
            </Card>
          ) : null}
          </div>

          {/* Two different meanings share this field, and they must not read as
              one. hasDeviation means the signed paper differs from the offer
              that was accepted. Without it, the note is how a pre-system
              deal's figures were arrived at — recorded because these
              societies predate the standard and share no single method. */}
          {!agreement.hasDeviation && agreement.deviationNote && (
            <div className="rounded-[var(--r-md)] border p-4 text-sm"
              style={{ borderColor: "var(--hairline)", background: "var(--surface-sunken)" }}>
              <strong>How this deal&apos;s figures were arrived at</strong>
              <p className="mt-1 text-[var(--text-muted)]">{agreement.deviationNote}</p>
              <p className="mt-1 text-[var(--text-subtle)]">
                None of this can be corrected — it is what was signed and what this society has been
                billed on. It is recorded so the basis of a figure is available when the figure is
                questioned.
              </p>
            </div>
          )}

          {agreement.hasDeviation && (
            <div
              className="rounded-[var(--r-md)] border p-4 text-sm"
              style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" }}
            >
              <strong>The signed document differs from the accepted offer.</strong>
              <p className="mt-1">{agreement.deviationNote}</p>
              <p className="mt-1">
                The executed document is authoritative; this note exists so the difference is visible rather than
                silently reconciled.
              </p>
            </div>
          )}


        </div>
      )}
    </>
  );
}
