"use client";

import { useState, useTransition } from "react";
import type { KycDocumentType, KycRequirementStatus, ReceiptChannel } from "@prisma/client";
import { ErrorText, Field } from "@/components/ui";
import { uploadFileToS3 } from "@/lib/upload-to-s3";
import {
  markKycNotApplicable,
  recordKycDocument,
  recordKycFollowUp,
  rejectKycDocument,
  reopenKycRequirement,
  verifyKycDocument,
} from "./actions";

const DOC_TYPE_KEY = {
  gst_certificate: "kycGstCertificate",
  electricity_bill: "kycElectricityBill",
} as const;

const CHANNELS: { value: ReceiptChannel; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "portal", label: "Society portal" },
  { value: "call", label: "Phone call" },
  { value: "in_person", label: "In person" },
];

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

// All inputs here are controlled — an uncontrolled `required` field is a
// latent version of the React 19 form-reset bug already documented in
// PROJECT_CONTEXT.md, and every one of these forms can fail and be resubmitted.
export function KycItem({
  pipelineId,
  societyName,
  type,
  status,
  files,
}: {
  pipelineId: string;
  societyName: string;
  type: KycDocumentType;
  status: KycRequirementStatus;
  files: { id: string; fileName: string; state: string }[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [channel, setChannel] = useState<ReceiptChannel>("whatsapp");
  // INV-04 — the document's period is an explicit selection, never inferred
  // from the file or the upload time.
  const [period, setPeriod] = useState(thisMonth());
  const [followUp, setFollowUp] = useState("");
  const [naReason, setNaReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = pending || uploading;

  function run(fn: () => Promise<{ error?: string } | undefined>) {
    startTransition(async () => {
      const result = await fn();
      setError(result?.error);
    });
  }

  async function submitDocument() {
    if (!file) return setError("Choose the document file first.");
    setError(undefined);
    setUploading(true);
    try {
      const s3Key = await uploadFileToS3(file, {
        society: societyName,
        month: period,
        docType: DOC_TYPE_KEY[type],
        dateLabel: period,
      });
      const result = await recordKycDocument(pipelineId, {
        type,
        s3Key,
        fileName: file.name,
        receiptChannel: channel,
      });
      if (result?.error) setError(result.error);
      else setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const pendingFiles = files.filter((f) => f.state === "pending");

  return (
    <div className="space-y-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
      {status !== "not_applicable" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Document file" htmlFor={`kyc-file-${type}`}>
            <input
              id={`kyc-file-${type}`}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="field"
            />
          </Field>
          <Field label="Received via" htmlFor={`kyc-ch-${type}`}>
            <select
              id={`kyc-ch-${type}`}
              value={channel}
              onChange={(e) => setChannel(e.target.value as ReceiptChannel)}
              disabled={busy}
              className="field"
            >
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Document period" htmlFor={`kyc-p-${type}`} hint="An explicit choice (INV-04).">
            <input
              id={`kyc-p-${type}`}
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              disabled={busy}
              className="field"
            />
          </Field>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {status !== "not_applicable" && (
          <button type="button" onClick={submitDocument} disabled={busy || !file} className="btn-primary btn-sm">
            {uploading ? "Uploading…" : "Record document"}
          </button>
        )}
        {pendingFiles.map((f) => (
          <span key={f.id} className="flex gap-2">
            <button
              type="button"
              onClick={() => run(() => verifyKycDocument(pipelineId, f.id))}
              disabled={busy}
              className="btn-secondary btn-sm"
            >
              Verify {f.fileName.slice(0, 18)}
            </button>
            <button
              type="button"
              onClick={() => setRejectingId(rejectingId === f.id ? null : f.id)}
              disabled={busy}
              className="btn-ghost btn-sm"
            >
              Reject
            </button>
          </span>
        ))}
        {status === "not_applicable" && (
          <button
            type="button"
            onClick={() => run(() => reopenKycRequirement(pipelineId, type))}
            disabled={busy}
            className="btn-secondary btn-sm"
          >
            Reopen this requirement
          </button>
        )}
      </div>

      {rejectingId && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="grow">
            <Field label="Why is it being rejected?" htmlFor={`kyc-rr-${type}`}>
              <input
                id={`kyc-rr-${type}`}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                disabled={busy}
                placeholder="Illegible scan — the GSTIN isn't readable."
                className="field"
              />
            </Field>
          </div>
          <button
            type="button"
            onClick={() =>
              run(async () => {
                const r = await rejectKycDocument(pipelineId, rejectingId, rejectReason);
                if (!r?.error) {
                  setRejectingId(null);
                  setRejectReason("");
                }
                return r;
              })
            }
            disabled={busy || !rejectReason.trim()}
            className="btn-danger btn-sm"
          >
            Reject document
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="grow">
          <Field label="Record a follow-up" htmlFor={`kyc-fu-${type}`} hint="Counts toward this step's stall signal (CON-23).">
            <input
              id={`kyc-fu-${type}`}
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              disabled={busy}
              placeholder="Called the secretary — will send the certificate by Friday."
              className="field"
            />
          </Field>
        </div>
        <button
          type="button"
          onClick={() =>
            run(async () => {
              const r = await recordKycFollowUp(pipelineId, type, followUp);
              if (!r?.error) setFollowUp("");
              return r;
            })
          }
          disabled={busy || !followUp.trim()}
          className="btn-secondary btn-sm"
        >
          Log follow-up
        </button>
      </div>

      {status !== "not_applicable" && status !== "verified" && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="grow">
            <Field
              label="Not applicable to this society"
              htmlFor={`kyc-na-${type}`}
              hint="Requires a reason — otherwise it just hides from the stall signal."
            >
              <input
                id={`kyc-na-${type}`}
                value={naReason}
                onChange={(e) => setNaReason(e.target.value)}
                disabled={busy}
                placeholder="Society is not GST-registered."
                className="field"
              />
            </Field>
          </div>
          <button
            type="button"
            onClick={() =>
              run(async () => {
                const r = await markKycNotApplicable(pipelineId, type, naReason);
                if (!r?.error) setNaReason("");
                return r;
              })
            }
            disabled={busy || !naReason.trim()}
            className="btn-ghost btn-sm"
          >
            Mark not applicable
          </button>
        </div>
      )}

      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
