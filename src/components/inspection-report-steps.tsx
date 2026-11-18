"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileCheck2 } from "lucide-react";
import { FileDrop } from "@/components/file-drop";

type Presign = (input: { inspectionId: string; fileName: string; contentType: string }) => Promise<{ uploadUrl: string; key: string } | { error: string }>;
type Attach = (input: { id: string; key: string }) => Promise<{ error?: string }>;

/**
 * The inspection report's two steps, in order (2026-11-18, user-asked):
 * 1. download the generated PDF; 2. once it is printed and signed, upload a
 * photo or scan of the signed copy. The upload is offered only after the
 * download (or "Next"), so nobody is asked for a signed copy of a report they
 * have not yet got. Shared by the back office and the society's portal, each
 * passing its own server actions.
 */
export function InspectionReportSteps({
  inspectionId,
  downloadHref,
  signedHref,
  signedIsPdf,
  presign,
  attach,
  canUpload = true,
}: {
  inspectionId: string;
  downloadHref: string;
  signedHref: string | null;
  signedIsPdf: boolean;
  presign: Presign;
  attach: Attach;
  canUpload?: boolean;
}) {
  const router = useRouter();
  const [stepTwo, setStepTwo] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const showUpload = canUpload && (signedHref ? replacing : stepTwo);

  function upload() {
    if (!file) return;
    setError(null);
    start(async () => {
      const contentType = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
      const p = await presign({ inspectionId, fileName: file.name, contentType });
      if ("error" in p) return setError(p.error);
      const put = await fetch(p.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": contentType } }).catch(() => null);
      if (!put?.ok) return setError("The upload did not go through — check the connection and try again.");
      const r = await attach({ id: inspectionId, key: p.key });
      if (r.error) return setError(r.error);
      setFile(null);
      setReplacing(false);
      setSaved(true);
      router.refresh();
    });
  }

  const stepNum = (n: number, done: boolean) => (
    <span
      aria-hidden
      className="num inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
      style={done ? { background: "var(--ok-bg)", color: "var(--ok-fg)" } : { background: "var(--accent-subtle)", color: "var(--accent)" }}
    >
      {done ? "✓" : n}
    </span>
  );

  return (
    <ol className="space-y-4">
      <li className="flex gap-3">
        {stepNum(1, stepTwo || !!signedHref)}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Download the report</p>
          <p className="mb-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
            A PDF of this visit — print it for the society representative to sign and stamp.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <a href={downloadHref} className="btn-secondary inline-flex items-center gap-2" onClick={() => setStepTwo(true)}>
              <Download size={16} aria-hidden /> Download PDF
            </a>
            {canUpload && !signedHref && !stepTwo && (
              <button type="button" className="text-[13px] font-semibold underline" style={{ color: "var(--accent)" }} onClick={() => setStepTwo(true)}>
                Already have it — next
              </button>
            )}
          </div>
        </div>
      </li>

      <li className="flex gap-3">
        {stepNum(2, !!signedHref)}
        <div className="min-w-0 flex-1">
          <p className="font-semibold" style={!signedHref && !stepTwo ? { color: "var(--text-subtle)" } : undefined}>
            Upload the signed copy
          </p>
          {signedHref ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
              <span className="inline-flex items-center gap-1.5">
                <FileCheck2 size={16} aria-hidden style={{ color: "var(--ok-fg)" }} />
                {saved ? "Saved — the signed copy is on file." : "Signed copy on file."}
              </span>
              <a href={signedHref} target="_blank" rel="noreferrer" className="font-semibold underline" style={{ color: "var(--accent)" }}>
                View {signedIsPdf ? "the scan" : "the photo"}
              </a>
              {canUpload && !replacing && (
                <button type="button" className="font-semibold underline" style={{ color: "var(--accent)" }} onClick={() => setReplacing(true)}>
                  Replace
                </button>
              )}
            </div>
          ) : !showUpload ? (
            <p className="text-[13px]" style={{ color: "var(--text-subtle)" }}>
              {canUpload ? "Opens once the report is downloaded." : "Not uploaded yet."}
            </p>
          ) : null}

          {showUpload && (
            <div className="mt-2 space-y-2">
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                A photo or a PDF scan of the printed report with both signatures and the stamp.
              </p>
              <FileDrop
                id={`signed-${inspectionId}`}
                accept="image/*,application/pdf"
                files={file ? [file] : []}
                onFiles={(f) => setFile(f[0] ?? null)}
                hint="Photo or PDF scan"
                disabled={pending}
                ariaLabel="Signed copy of the report"
              />
              {error && (
                <p role="alert" className="text-[13px]" style={{ color: "var(--bad-fg)" }}>
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary" disabled={!file || pending} onClick={upload}>
                  {pending ? "Uploading…" : "Upload the signed copy"}
                </button>
                {replacing && (
                  <button type="button" className="btn-secondary" disabled={pending} onClick={() => { setReplacing(false); setFile(null); }}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </li>
    </ol>
  );
}
