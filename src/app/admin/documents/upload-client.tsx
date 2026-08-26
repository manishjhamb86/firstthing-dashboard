"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { validateDocumentUpload } from "@/lib/document-catalog";
import { finalizeDocument, presignDocument } from "./actions";

type TypeOption = {
  id: string;
  label: string;
  operation: string;
  context: "society" | "pipeline" | "circuit";
  needsPeriod: boolean;
  acceptedExtensions: string[];
  maxMb: number;
  uploadHere: boolean;
  handledAt: string | null;
};
type Option = { id: string; label: string };
type Scoped = { id: string; societyId: string; label: string };

/** The first 4 KB is all the evidence needed to know what a file really is. */
async function headOf(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, 4096).arrayBuffer());
}
/**
 * Hashed in the browser so an identical re-upload can be refused BEFORE the
 * bytes reach S3 — this app's credentials cannot delete an object, so a file
 * accepted and then discarded would sit in the bucket forever. The server
 * re-hashes what actually landed; this one only decides whether to start.
 */
async function sha256Of(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function DocumentUploadClient({
  canUpload,
  types,
  societies,
  pipelines,
  circuits,
}: {
  canUpload: boolean;
  types: TypeOption[];
  societies: Option[];
  pipelines: Scoped[];
  circuits: Scoped[];
}) {
  const router = useRouter();
  const [typeId, setTypeId] = useState("");
  // Society is asked FIRST, always (the user's call, 2026-08-26). Asking for a
  // circuit up front dead-ends every society that has none yet — which is all
  // of them until a survey has run — with an empty dropdown and no way on.
  const [societyId, setSocietyId] = useState("");
  const [contextId, setContextId] = useState("");
  const [period, setPeriod] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; href?: string } | null>(null);
  const [pending, start] = useTransition();

  const spec = useMemo(() => types.find((t) => t.id === typeId) ?? null, [types, typeId]);
  const scoped: Scoped[] =
    spec?.context === "circuit" ? circuits : spec?.context === "pipeline" ? pipelines : [];
  const withinSociety = scoped.filter((o) => o.societyId === societyId);
  const contextLabel = spec?.context === "circuit" ? "Circuit" : "Deal";
  const societyName = societies.find((s) => s.id === societyId)?.label ?? "";
  // For a society-scoped document the society IS the context.
  const effectiveContextId = spec?.context === "society" ? societyId : contextId;

  if (!canUpload) {
    return (
      <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
        Filing documents needs the manage pipeline permission.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Field label="Document type" htmlFor="doc-type" hint="What it is decides what a valid file looks like.">
        <select
          id="doc-type"
          className="field"
          value={typeId}
          onChange={(e) => {
            setTypeId(e.target.value);
            setContextId("");
            setError(null);
            setDone(null);
          }}
        >
          <option value="">Choose a document type…</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>

      {spec && (
        <div
          className="rounded-[var(--r-md)] border p-3.5 text-[13px]"
          style={{ borderColor: "var(--accent-line)", background: "var(--accent-subtle)" }}
        >
          <p>{spec.operation}</p>
          <p className="mt-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
            Accepts {spec.acceptedExtensions.map((e) => `.${e}`).join(", ")} · up to{" "}
            <span className="num">{spec.maxMb}</span> MB
          </p>
        </div>
      )}

      {spec && !spec.uploadHere ? (
        // Half-doing an operation is worse than naming where it belongs.
        <p className="text-[13px]" style={{ color: "var(--warn-fg)" }}>
          A {spec.label.toLowerCase()} is filed on {spec.handledAt}.
        </p>
      ) : spec ? (
        <>
          {/* Society first, always. Everything else narrows to it. */}
          <Field label="Society" htmlFor="doc-society">
            <select
              id="doc-society"
              className="field"
              value={societyId}
              onChange={(e) => {
                setSocietyId(e.target.value);
                setContextId("");
                setError(null);
              }}
            >
              <option value="">Choose the society…</option>
              {societies.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          {spec.context !== "society" && societyId && (
            <Field label={contextLabel} htmlFor="doc-context">
              {withinSociety.length === 0 ? (
                // The dead end this replaced: an empty dropdown and no way on.
                <div
                  className="rounded-[var(--r-md)] border p-3.5 text-[13px]"
                  style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" }}
                >
                  {spec.context === "circuit" ? (
                    <>
                      <p className="mb-1 font-semibold">{societyName} has no circuits yet.</p>
                      <p>
                        A circuit is what readings are recorded against. For a society commissioned before
                        this system existed, file its <strong>pre-installation demo report</strong> here
                        first — it carries the light counts, wattages and running hours a circuit is built
                        from.
                      </p>
                      <button
                        type="button"
                        className="btn-secondary mt-2"
                        onClick={() => {
                          setTypeId("preDemoReport");
                          setContextId("");
                          setError(null);
                        }}
                      >
                        File its demo report instead
                      </button>
                    </>
                  ) : (
                    <p>{societyName} has no deal on the system yet — log a lead for it first.</p>
                  )}
                </div>
              ) : (
                <select
                  id="doc-context"
                  className="field"
                  value={contextId}
                  onChange={(e) => setContextId(e.target.value)}
                >
                  <option value="">Choose the {contextLabel.toLowerCase()}…</option>
                  {withinSociety.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}

          {spec.needsPeriod && (
            <Field
              label="Filed under (period)"
              htmlFor="doc-period"
              hint="The slot it files under and versions against — not a claim about what it covers. A report spanning several months is fine; the span it states is read from the document itself."
            >
              <input
                id="doc-period"
                type="month"
                className="field field-auto"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </Field>
          )}

          <Field label="File" htmlFor="doc-file">
            <input
              id="doc-file"
              type="file"
              className="field"
              accept={spec.acceptedExtensions.map((e) => `.${e}`).join(",")}
              onChange={async (e) => {
                setDone(null);
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (!f) return setError(null);
                // The same rule the server will apply, run here only so the
                // answer is instant. The server's copy is the one that counts.
                const verdict = validateDocumentUpload({
                  docTypeId: spec.id,
                  fileName: f.name,
                  byteSize: f.size,
                  head: await headOf(f),
                });
                setError(verdict.ok ? null : verdict.reason);
              }}
            />
          </Field>

          {error && <ErrorText>{error}</ErrorText>}
          {done && (
            <p className="text-[13px]" style={{ color: "var(--ok-fg)" }}>
              {done.message}{" "}
              {done.href && (
                <Link href={done.href} className="font-semibold">
                  Open it →
                </Link>
              )}
            </p>
          )}

          <button
            type="button"
            className="btn-primary"
            disabled={pending || !file || !effectiveContextId}
            onClick={() =>
              start(async () => {
                if (!file) return;
                setError(null);
                setDone(null);
                const head = await headOf(file);
                const presigned = await presignDocument({
                  docTypeId: spec.id,
                  contextId: effectiveContextId,
                  period,
                  fileName: file.name,
                  contentType: file.type || "application/octet-stream",
                  byteSize: file.size,
                  headBase64: toBase64(head),
                  clientSha256: await sha256Of(file),
                });
                if ("error" in presigned) return setError(presigned.error);

                const put = await fetch(presigned.uploadUrl, {
                  method: "PUT",
                  body: file,
                  headers: { "Content-Type": file.type || "application/octet-stream" },
                });
                if (!put.ok) return setError(`The upload failed (${put.status}). Nothing was filed.`);

                const filed = await finalizeDocument({
                  docTypeId: spec.id,
                  contextId: effectiveContextId,
                  s3Key: presigned.key,
                  fileName: file.name,
                  contentType: file.type || "application/octet-stream",
                  byteSize: file.size,
                  period,
                });
                if (filed.error) return setError(filed.error);
                setDone({ message: filed.message ?? "Filed.", href: filed.href });
                setFile(null);
                router.refresh();
              })
            }
          >
            {pending ? "Filing…" : "Upload & file"}
          </button>
        </>
      ) : null}
    </div>
  );
}
