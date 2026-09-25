import Link from "next/link";
import { formatDate } from "@/lib/format-date";
import { dealLabel } from "@/lib/deal-scope";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import {
  KYC_FILE_STATE,
  KYC_REQUIREMENT_STATUS,
  RECEIPT_CHANNEL_LABEL,
  statusMeta,
} from "@/lib/status-maps";
import { KYC_REQUIREMENTS } from "@/lib/kyc";
import { bestKycAcross, kycStateOf, kycStateSettles } from "@/lib/kyc-society";
import { KycFactForm } from "./kyc-fact-form";
import { publicS3Url } from "@/lib/s3";
import { KycItem } from "./kyc-item";
import { loadDealProgress } from "@/lib/pipeline-facts";
import { NextStepCallout, StepComplete } from "@/components/deal-stepper";

// FEAT-024/026 — the KYC checklist for one pipeline. Read-only for any
// internal actor who isn't PER-01 (FEAT-024-AC-4): the item components are
// handed `canEdit` and render the record without the controls when false.
export default async function KycPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminPage();
  if (!session.user.adminPermissions?.includes("manage_pipeline")) redirect("/admin/pipeline");
  const canEdit =
    session.user.adminPermissions.includes("manage_survey") &&
    session.user.adminPermissions.includes("manage_pipeline");

  const { id } = await params;
  const kycInclude = {
    files: { orderBy: { uploadedAt: "desc" as const }, include: { uploadedBy: true, verifiedBy: true } },
    followUps: { orderBy: { recordedAt: "desc" as const }, include: { recordedBy: true } },
    markedNaBy: true,
    pipeline: { select: { id: true, serviceLine: true, dealScope: true } },
  };
  const pipeline = await db.pipeline.findUnique({
    where: { id },
    include: {
      // KYC is a society fact (kyc-society.ts): a document verified on a
      // sibling deal is shown here as on file, not asked for again.
      society: { include: { pipelines: { select: { kycRequirements: { include: kycInclude } } } } },
    },
  });
  if (!pipeline) notFound();

  // The checklist is driven by KYC_REQUIREMENTS, not by the rows that happen
  // to exist — FEAT-024-AC-2's "all items show as outstanding with a clear
  // request action, not an empty panel" is then true for free on a pipeline
  // nobody has touched yet.
  const best = bestKycAcross(pipeline.society.pipelines.flatMap((p) => p.kycRequirements), pipeline.id);
  const facts = { gstNumber: pipeline.society.gstNumber, electricityUnitRate: pipeline.society.electricityUnitRate };
  const items = KYC_REQUIREMENTS.map((req) => {
    const b = best.get(req.type);
    return {
      ...req,
      record: b?.record ?? null,
      // Recorded on another of the society's deals — shown, never re-collected.
      onFileFrom: b && !b.own ? b.record.pipeline : null,
      // Verified / not applicable / the number recorded — any of them settles GATE-01.
      state: kycStateOf(req.type, best, facts),
      fact: req.type === "gst_certificate" ? facts.gstNumber : facts.electricityUnitRate != null ? String(facts.electricityUnitRate) : null,
    };
  });
  const settled = items.filter((i) => kycStateSettles(i.state)).length;
  const allSettled = settled === items.length;
  // What comes next on the deal once this step is closed out. Resolved from
  // the same sequencing module every other screen uses, so this page cannot
  // point somewhere the spine disagrees with.
  const progress = allSettled ? await loadDealProgress(pipeline.id) : null;

  return (
    <>
      <PageHeader
        backHref={`/admin/pipeline/${pipeline.id}`}
        title="KYC documents"
        chip={
          <StatusChip tone={settled === items.length ? "ok" : "warn"}>
            {settled} of {items.length} settled
          </StatusChip>
        }
        subtitle={`${dealLabel(pipeline.serviceLine, pipeline.dealScope)} · collected before the agreement can be executed`}
      />

      {!canEdit && (
        <p className="max-w-2xl mb-6 text-sm text-[var(--text-muted)]">
          Read-only — recording, verifying and following up on KYC documents is an operations action.
        </p>
      )}

      {/* A finished step should say so unmistakably, and then say where to go
          — the checklist reading "2 of 2 settled" in a header chip was the
          only signal that GATE-01 was cleared (user-asked 2026-08-20). */}
      {/* One card, not two stacked. When there is a next step the outcome
          rides inside it; only a finished deal with nowhere to go still needs
          a standalone confirmation. */}
      {progress?.next ? (
        <NextStepCallout
          next={progress.next}
          done={allSettled ? "KYC complete — every item is verified, recorded, or not applicable, so KYC no longer holds up the agreement." : undefined}
        />
      ) : (
        allSettled && (
          <StepComplete title="KYC complete — this step is done.">
            Every document is verified or recorded as not applicable, so KYC no longer holds up the
            agreement.
          </StepComplete>
        )
      )}

      <div className="max-w-none space-y-6">
        {items.map((item) => {
          const record = item.record;
          const status = statusMeta(KYC_REQUIREMENT_STATUS, item.state);
          // Settled items (verified, not applicable, or a recorded fact) fold
          // to just the status chip — user-reported 2026-09-18: both cards
          // stayed fully expanded (upload dropzone, follow-up field, every
          // form) even once "Recorded — document pending" already settled
          // GATE-01, which buried the one line that mattered under controls
          // for chasing something no longer being chased. Same closed-by-
          // default / one-toggle-away convention as StepSection's done rows.
          const settled = kycStateSettles(item.state);
          const body = (
            <>
              {item.onFileFrom && (
                <p
                  className="mb-4 rounded-[var(--r-md)] border p-3 text-sm"
                  style={{ borderColor: "var(--info-line)", background: "var(--info-bg)", color: "var(--info-fg)" }}
                >
                  Already on file for this society — recorded on{" "}
                  <Link href={`/admin/pipeline/${item.onFileFrom.id}/kyc`} className="font-medium underline">
                    {dealLabel(item.onFileFrom.serviceLine, item.onFileFrom.dealScope)}
                  </Link>
                  . One document covers every deal; it is not collected again here.
                </p>
              )}

              {record?.status === "not_applicable" && (
                <p className="mb-4 text-sm">
                  Marked not applicable by {record.markedNaBy?.name ?? record.markedNaBy?.email ?? "—"}:{" "}
                  <span className="text-[var(--text-muted)]">{record.notApplicableReason}</span>
                </p>
              )}

              {item.fact && item.state !== "not_applicable" && (
                <p className="mb-4 text-sm">
                  {item.type === "gst_certificate" ? "GSTIN on record: " : "Tariff on record: "}
                  <span className="num">{item.type === "gst_certificate" ? item.fact : `₹${item.fact}/kWh`}</span>
                  {item.state === "fact_only" && (
                    <span className="text-[var(--text-muted)]"> — the document itself is still to be filed.</span>
                  )}
                </p>
              )}

              {/* A requirement deliberately marked not applicable is not
                  waiting for anything — the line above IS its record, and the
                  chase empty state under it told the operator to record a
                  document nobody is going to send. */}
              {(!record || record.files.length === 0) && record?.status !== "not_applicable" ? (
                <div className="mb-4">
                  <EmptyState title="Nothing received yet">
                    Record the document once it arrives — by portal, WhatsApp, email or in person.
                  </EmptyState>
                </div>
              ) : !record || record.files.length === 0 ? null : (
                <div className="mb-4 overflow-x-auto">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Document</th>
                        <th>Received via</th>
                        <th>State</th>
                        <th>Recorded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {record.files.map((f) => {
                        const fs = statusMeta(KYC_FILE_STATE, f.state);
                        return (
                          <tr key={f.id}>
                            <td>
                              <a
                                href={publicS3Url(f.s3Key)}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:underline"
                              >
                                {f.fileName}
                              </a>
                              {f.state === "rejected" && f.rejectionReason && (
                                <div className="text-xs text-[var(--text-muted)]">
                                  Rejected: {f.rejectionReason}
                                </div>
                              )}
                            </td>
                            <td>{RECEIPT_CHANNEL_LABEL[f.receiptChannel]}</td>
                            <td>
                              <StatusChip tone={fs.tone}>{fs.label}</StatusChip>
                            </td>
                            <td className="num">{formatDate(f.uploadedAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {record && record.followUps.length > 0 && (
                <div className="mb-4">
                  <p className="lbl mb-1">Follow-ups ({record.followUps.length})</p>
                  <ul className="text-sm space-y-1">
                    {record.followUps.map((f) => (
                      <li key={f.id} className="text-[var(--text-muted)]">
                        <span className="num">{formatDate(f.recordedAt)}</span> —{" "}
                        {f.note}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {canEdit && item.state !== "verified" && item.state !== "not_applicable" && (
                <KycFactForm pipelineId={pipeline.id} type={item.type} current={item.fact} />
              )}
              {canEdit && !item.onFileFrom && (
                <KycItem
                  pipelineId={pipeline.id}
                  societyName={pipeline.society.name}
                  type={item.type}
                  status={record?.status ?? "outstanding"}
                  files={record?.files.map((f) => ({ id: f.id, fileName: f.fileName, state: f.state })) ?? []}
                />
              )}
            </>
          );
          return (
            <Card key={item.type} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-1">
                <CardTitle>{item.label}</CardTitle>
                <StatusChip tone={status.tone}>{status.label}</StatusChip>
              </div>
              <p className="text-sm text-[var(--text-muted)] mb-4">{item.hint}</p>

              {settled ? (
                <details className="group">
                  <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 text-sm font-medium text-[var(--accent)] [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">View the record</span>
                    <span className="hidden group-open:inline">Hide the record</span>
                  </summary>
                  <div className="mt-4">{body}</div>
                </details>
              ) : (
                body
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
