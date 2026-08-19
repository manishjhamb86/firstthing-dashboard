import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { CONTRACT_STATUS, SERVICE_LINE_LABEL, statusMeta } from "@/lib/status-maps";
import { publicS3Url } from "@/lib/s3";
import {
  ActivateContractForm,
  ExecutedUploadForm,
  PrepareAgreementButton,
  StepButton,
} from "./agreement-controls";

function stepChip(done: Date | null) {
  return done ? (
    <StatusChip tone="ok">{done.toISOString().slice(0, 10)}</StatusChip>
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
    },
  });
  if (!pipeline) notFound();

  const agreement = pipeline.agreement;
  const contract = pipeline.contract;
  const contractStatus = contract ? statusMeta(CONTRACT_STATUS, contract.status) : null;
  const currentTerms = contract?.versions[0] ?? null;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href={`/admin/pipeline/${pipeline.id}`} className="hover:underline">
            {pipeline.society.name}
          </Link>
        }
        title="Agreement & contract"
        chip={contractStatus ? <StatusChip tone={contractStatus.tone}>{contractStatus.label}</StatusChip> : undefined}
        subtitle={`${SERVICE_LINE_LABEL[pipeline.serviceLine]} · prepared from the accepted offer`}
      />

      {!agreement ? (
        <div className="max-w-none space-y-4">
          {/* FEAT-029-AC-2 — what's outstanding, as discrete steps. */}
          <EmptyState title="No agreement prepared yet">
            Once the society accepts an offer and KYC is settled, the agreement is prepared from exactly the
            terms they accepted — then printed, notarized, signed and scanned back in.
          </EmptyState>
          {canEdit && <PrepareAgreementButton pipelineId={pipeline.id} />}
        </div>
      ) : (
        <div className="max-w-none space-y-6">
          <Card className="p-5">
            <CardTitle>Execution steps</CardTitle>
            <p className="text-sm text-[var(--text-muted)] mt-1 mb-4">
              Prepared {agreement.preparedAt.toISOString().slice(0, 10)} by{" "}
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

            <div className="mt-4">
              <Link href={`/admin/pipeline/${pipeline.id}/agreement/print`} className="btn-secondary btn-sm">
                Open the printable agreement
              </Link>
            </div>
          </Card>

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

          {canEdit && !agreement.executedS3Key && (
            <Card className="p-5">
              <CardTitle>Upload the executed agreement</CardTitle>
              <p className="text-sm text-[var(--text-muted)] mt-1 mb-4">
                A hard gate — the deal cannot advance to installation without it, because installation commits
                FirsThing&apos;s own capital.
              </p>
              <ExecutedUploadForm pipelineId={pipeline.id} societyName={pipeline.society.name} />
            </Card>
          )}

          {contract ? (
            <Card className="p-5">
              <CardTitle>Contract</CardTitle>
              <p className="text-sm text-[var(--text-muted)] mt-1 mb-4">
                Activated {contract.activatedAt?.toISOString().slice(0, 10)} by{" "}
                {contract.activatedBy?.name ?? contract.activatedBy?.email ?? "—"} · term{" "}
                {contract.termStart.toISOString().slice(0, 10)} → {contract.termEnd.toISOString().slice(0, 10)}
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
                      v{currentTerms.version}, effective {currentTerms.effectiveFrom.toISOString().slice(0, 10)}
                    </dd>
                  </div>
                </dl>
              )}
              <p className="text-sm text-[var(--text-muted)] mt-4">
                Terms are versioned and effective-dated: an amendment applies forward only, and a prior month
                stays computed against the version in force at the time.
              </p>
            </Card>
          ) : (
            canEdit && (
              <Card className="p-5">
                <CardTitle>Activate the contract</CardTitle>
                <p className="text-sm text-[var(--text-muted)] mt-1 mb-4">
                  Carries the accepted offer&apos;s terms — tolerance, revenue share, unit rate, exclusions, spare
                  stock and the per-circuit benchmark table — as version 1.
                </p>
                <ActivateContractForm pipelineId={pipeline.id} />
              </Card>
            )
          )}
        </div>
      )}
    </>
  );
}
