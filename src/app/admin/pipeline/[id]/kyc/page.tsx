import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import {
  KYC_FILE_STATE,
  KYC_REQUIREMENT_STATUS,
  RECEIPT_CHANNEL_LABEL,
  SERVICE_LINE_LABEL,
  statusMeta,
} from "@/lib/status-maps";
import { KYC_REQUIREMENTS, kycIsSettled } from "@/lib/kyc";
import { publicS3Url } from "@/lib/s3";
import { KycItem } from "./kyc-item";

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
  const pipeline = await db.pipeline.findUnique({
    where: { id },
    include: {
      society: true,
      kycRequirements: {
        include: {
          files: { orderBy: { uploadedAt: "desc" }, include: { uploadedBy: true, verifiedBy: true } },
          followUps: { orderBy: { recordedAt: "desc" }, include: { recordedBy: true } },
          markedNaBy: true,
        },
      },
    },
  });
  if (!pipeline) notFound();

  // The checklist is driven by KYC_REQUIREMENTS, not by the rows that happen
  // to exist — FEAT-024-AC-2's "all items show as outstanding with a clear
  // request action, not an empty panel" is then true for free on a pipeline
  // nobody has touched yet.
  const items = KYC_REQUIREMENTS.map((req) => ({
    ...req,
    record: pipeline.kycRequirements.find((r) => r.type === req.type) ?? null,
  }));
  const settled = items.filter((i) => i.record && kycIsSettled(i.record.status)).length;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href={`/admin/pipeline/${pipeline.id}`} className="hover:underline">
            {pipeline.society.name}
          </Link>
        }
        title="KYC documents"
        chip={
          <StatusChip tone={settled === items.length ? "ok" : "warn"}>
            {settled} of {items.length} settled
          </StatusChip>
        }
        subtitle={`${SERVICE_LINE_LABEL[pipeline.serviceLine]} · collected before the agreement can be executed`}
      />

      {!canEdit && (
        <p className="max-w-2xl mb-6 text-sm text-[var(--text-muted)]">
          Read-only — recording, verifying and following up on KYC documents is PER-01&apos;s action.
        </p>
      )}

      <div className="max-w-3xl space-y-6">
        {items.map((item) => {
          const record = item.record;
          const status = statusMeta(KYC_REQUIREMENT_STATUS, record?.status ?? "outstanding");
          return (
            <Card key={item.type} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-1">
                <CardTitle>{item.label}</CardTitle>
                <StatusChip tone={status.tone}>{status.label}</StatusChip>
              </div>
              <p className="text-sm text-[var(--text-muted)] mb-4">{item.hint}</p>

              {record?.status === "not_applicable" && (
                <p className="mb-4 text-sm">
                  Marked not applicable by {record.markedNaBy?.name ?? record.markedNaBy?.email ?? "—"}:{" "}
                  <span className="text-[var(--text-muted)]">{record.notApplicableReason}</span>
                </p>
              )}

              {!record || record.files.length === 0 ? (
                <div className="mb-4">
                  <EmptyState title="Nothing received yet">
                    Record the document once it arrives — by portal, WhatsApp, email or in person.
                  </EmptyState>
                </div>
              ) : (
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
                            <td className="num">{f.uploadedAt.toISOString().slice(0, 10)}</td>
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
                        <span className="num">{f.recordedAt.toISOString().slice(0, 10)}</span> —{" "}
                        {f.note}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {canEdit && (
                <KycItem
                  pipelineId={pipeline.id}
                  societyName={pipeline.society.name}
                  type={item.type}
                  status={record?.status ?? "outstanding"}
                  files={record?.files.map((f) => ({ id: f.id, fileName: f.fileName, state: f.state })) ?? []}
                />
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
