"use client";

import { FileDrop } from "@/components/file-drop";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, ErrorText, Field } from "@/components/ui";
import { SearchSelect } from "@/components/search-select";
import { DOC_GROUPS, docTypeDisplay } from "./doc-type-display";
import { validateDocumentUpload } from "@/lib/document-catalog";
import { extractGatePassFields, finalizeDocument, presignDocument, type GatePassCheck } from "./actions";

type TypeOption = {
  id: string;
  label: string;
  operation: string;
  context: "society" | "pipeline" | "circuit";
  needsPeriod: boolean;
  periodHint: string;
  /** Filed by the date and time printed on it (a gate pass), not a month. */
  issuedAt: boolean;
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
  initialTypeId,
  initialSocietyId,
}: {
  canUpload: boolean;
  types: TypeOption[];
  societies: Option[];
  pipelines: Scoped[];
  circuits: Scoped[];
  /** Arriving from a "Upload GST" / "Upload bill" prompt: the type and society are already known. */
  initialTypeId?: string;
  initialSocietyId?: string;
}) {
  const router = useRouter();
  const [typeId, setTypeId] = useState(initialTypeId ?? "");
  // Society is asked FIRST, always (the user's call, 2026-08-26). Asking for a
  // circuit up front dead-ends every society that has none yet — which is all
  // of them until a survey has run — with an empty dropdown and no way on.
  const [societyId, setSocietyId] = useState(initialSocietyId ?? "");
  const [contextId, setContextId] = useState("");
  const [periodPicked, setPeriod] = useState("");
  // A gate pass is filed by its date and time; its month follows from it.
  const [issuedAt, setIssuedAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; href?: string } | null>(null);
  const [pending, start] = useTransition();
  // Set once a gate pass's bytes are already in S3 but the read society/date
  // disagreed with what was chosen — the file is not re-uploaded on the next
  // click, only the already-uploaded key is finalized once the operator has
  // either corrected the fields or confirmed their own choice (2026-10-14).
  const [gatePassPendingKey, setGatePassPendingKey] = useState<string | null>(null);
  const [gatePassWarning, setGatePassWarning] = useState<GatePassCheck | null>(null);
  const societiesById = useMemo(() => new Map(societies.map((s) => [s.id, s.label])), [societies]);

  const spec = useMemo(() => types.find((t) => t.id === typeId) ?? null, [types, typeId]);
  const period = spec?.issuedAt ? issuedAt.slice(0, 7) : periodPicked;
  const scoped: Scoped[] =
    spec?.context === "circuit" ? circuits : spec?.context === "pipeline" ? pipelines : [];
  const withinSociety = scoped.filter((o) => o.societyId === societyId);
  const contextLabel = spec?.context === "circuit" ? "Circuit" : "Deal";
  const societyName = societies.find((s) => s.id === societyId)?.label ?? "";
  // For a society-scoped document the society IS the context.
  const effectiveContextId = spec?.context === "society" ? societyId : contextId;

  if (!canUpload) {
    return (
      <Card className="p-6">
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          Filing documents needs the manage pipeline permission.
        </p>
      </Card>
    );
  }

  function pickType(id: string) {
    setTypeId(id);
    setContextId("");
    setError(null);
    setDone(null);
    setGatePassPendingKey(null);
    setGatePassWarning(null);
  }

  // The picker offers only what is filed HERE (2026-11-27): a meter export
  // and a filed invoice copy have their own screens, named under the tiles.
  const filable = types.filter((t) => t.uploadHere);
  const groups = DOC_GROUPS.map((g) => ({ label: g, items: filable.filter((t) => docTypeDisplay(t.id).group === g) })).filter((g) => g.items.length > 0);
  const elsewhere = types.filter((t) => !t.uploadHere);
  const shown = spec ? docTypeDisplay(spec.id) : null;

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <div className="flex items-center gap-2.5">
          <StepNo n={1} />
          <h2 className="text-[17px] font-bold">What are you filing?</h2>
        </div>
        {spec && shown ? (
          <div
            className="mt-4 flex flex-wrap items-center gap-3 rounded-[var(--r-md)] border-[1.5px] px-3.5 py-3"
            style={{ borderColor: "var(--accent)", background: "var(--accent-subtle)" }}
          >
            <TypeIcon d={shown.icon} active />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{spec.label}</p>
              <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                {shown.group ?? "Filed on its own screen"}
              </p>
            </div>
            <button type="button" className="btn-ghost btn-sm" onClick={() => pickType("")}>
              Change
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {groups.map((g) => (
              <div key={g.label}>
                <p className="lbl mb-2">{g.label}</p>
                <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                  {g.items.map((t) => {
                    const d = docTypeDisplay(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => pickType(t.id)}
                        className="flex min-h-[64px] items-start gap-3 rounded-[var(--r-md)] border px-3.5 py-3 text-left hover:border-[var(--accent-line)] hover:bg-[var(--surface-hover)]"
                        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                      >
                        <TypeIcon d={d.icon} />
                        <span className="min-w-0">
                          <span className="block font-semibold">{t.label}</span>
                          <span className="block text-[12px] leading-snug" style={{ color: "var(--text-subtle)" }}>
                            {d.short}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {elsewhere.length > 0 && (
              <p className="border-t pt-3.5 text-[13px]" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
                Not here:{" "}
                {elsewhere.map((t, i) => (
                  <span key={t.id}>
                    {i > 0 ? "; " : ""}
                    {t.label.toLowerCase()} — {(t.handledAt ?? "").replace(/\.$/, "")}
                  </span>
                ))}
                .
              </p>
            )}
          </div>
        )}
      </Card>

      {!spec ? (
        <p className="rounded-[var(--r-md)] border border-dashed px-5 py-4 text-center text-[13px]" style={{ borderColor: "var(--border)", color: "var(--text-subtle)" }}>
          Pick a document type above — the society, month and file come next.
        </p>
      ) : (
      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-2.5">
          <StepNo n={2} />
          <h2 className="text-[17px] font-bold">{spec.uploadHere ? "Which society, and when?" : "Where this is filed"}</h2>
        </div>
        <div
          className="flex gap-2.5 rounded-[var(--r-md)] border p-3.5 text-[13px]"
          style={{ borderColor: "var(--info-line)", background: "var(--info-bg)", color: "var(--info-fg)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="mt-0.5 shrink-0">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 8h.01" />
          </svg>
          <span>{spec.operation}</span>
        </div>
      {spec && !spec.uploadHere ? (
        // Half-doing an operation is worse than naming where it belongs.
        <p className="text-[13px]" style={{ color: "var(--warn-fg)" }}>
          A {spec.label.toLowerCase()} is filed on {spec.handledAt}.
        </p>
      ) : spec ? (
        <>
          {/* Society first, always. Everything else narrows to it. */}
          <Field label="Society" htmlFor="doc-society">
            <SearchSelect
              id="doc-society"
              options={societies}
              value={societyId || null}
              placeholder="Type a society's name…"
              onCommit={(id) => {
                setSocietyId(id ?? "");
                setContextId("");
                setError(null);
                setGatePassWarning(null);
              }}
            />
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

          {spec.issuedAt && (
            <Field
              label="Issued on"
              htmlFor="doc-issued-at"
              hint={`${spec.periodHint} Each gate pass is its own document — several in a day are fine. Filing under the exact same date and time replaces that pass as a new version.`}
            >
              <input
                id="doc-issued-at"
                type="datetime-local"
                className="field field-auto"
                value={issuedAt}
                onChange={(e) => {
                  setIssuedAt(e.target.value);
                  setGatePassWarning(null);
                }}
              />
            </Field>
          )}

          {spec.needsPeriod && !spec.issuedAt && (
            <Field
              label="Month it belongs to"
              htmlFor="doc-period"
              hint={`${spec.periodHint} Filing another ${spec.label.toLowerCase()} for this society under the same month makes it version 2 of that one — so use the same month to replace it, a different month for a different document.`}
            >
              <input
                id="doc-period"
                type="month"
                className="field field-auto"
                value={period}
                onChange={(e) => {
                  setPeriod(e.target.value);
                  setGatePassWarning(null);
                }}
              />
            </Field>
          )}

          <Field
            label="File"
            htmlFor="doc-file"
            hint={`Accepts ${spec.acceptedExtensions.map((e) => `.${e}`).join(", ")} · up to ${spec.maxMb} MB`}
          >
            <FileDrop
              id="doc-file"
              accept={spec.acceptedExtensions.map((e) => `.${e}`).join(",")}
              files={file ? [file] : []}
              onFiles={async (picked) => {
                setDone(null);
                setGatePassPendingKey(null);
                setGatePassWarning(null);
                const f = picked[0] ?? null;
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

          {gatePassWarning && (
            <div
              className="rounded-[var(--r-md)] border p-3.5 text-[13px]"
              style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" }}
            >
              <p className="font-semibold">The gate pass itself reads differently — check which is correct.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-[11.5px] uppercase tracking-wide opacity-80">You selected</p>
                  <p>{societyName || "No society chosen"}</p>
                  <p>{spec.issuedAt ? (issuedAt ? issuedAt.replace("T", " · ") : "No date chosen") : period || "No month chosen"}</p>
                </div>
                <div>
                  <p className="text-[11.5px] uppercase tracking-wide opacity-80">The document reads</p>
                  <p>
                    {gatePassWarning.societyId
                      ? (societiesById.get(gatePassWarning.societyId) ?? gatePassWarning.societyNameOnDocument)
                      : gatePassWarning.societyNameOnDocument
                        ? `"${gatePassWarning.societyNameOnDocument}" — not one of FirsThing's societies`
                        : "No society legible"}
                  </p>
                  <p>{gatePassWarning.date || "No date legible"}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setGatePassWarning(null)}
                >
                  Keep what I selected
                </button>
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  disabled={!gatePassWarning.societyId && !gatePassWarning.date}
                  onClick={() => {
                    if (gatePassWarning.societyId) setSocietyId(gatePassWarning.societyId);
                    if (gatePassWarning.date) {
                      if (spec.issuedAt) setIssuedAt(`${gatePassWarning.date}T${issuedAt.slice(11, 16) || "09:00"}`);
                      else setPeriod(gatePassWarning.date.slice(0, 7));
                    }
                    setGatePassWarning(null);
                  }}
                >
                  Use what the document says
                </button>
              </div>
              <p className="mt-2 text-[12px] opacity-80">
                Either way, the society and {spec.issuedAt ? "date" : "month"} above can still be changed by hand before filing.
              </p>
            </div>
          )}

          <button
            type="button"
            className="btn-primary"
            disabled={pending || !file || !effectiveContextId || (spec.issuedAt && !issuedAt)}
            onClick={() =>
              start(async () => {
                if (!file) return;
                setError(null);
                setDone(null);

                let s3Key = gatePassPendingKey;
                if (!s3Key) {
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
                    issuedAt: spec.issuedAt ? issuedAt : undefined,
                  });
                  if ("error" in presigned) return setError(presigned.error);

                  const put = await fetch(presigned.uploadUrl, {
                    method: "PUT",
                    body: file,
                    headers: { "Content-Type": file.type || "application/octet-stream" },
                  });
                  if (!put.ok) return setError(`The upload failed (${put.status}). Nothing was filed.`);
                  s3Key = presigned.key;

                  // A gate pass gets one extra, optional check before it is
                  // filed: read the society and date off the form itself and
                  // warn if either disagrees with what was chosen (2026-10-14,
                  // user-asked). Any other type, or a file this can't read
                  // (a zip, a Word original), proceeds exactly as before.
                  if (spec.id === "gatePass") {
                    const check = await extractGatePassFields({
                      s3Key,
                      fileName: file.name,
                      chosenSocietyId: effectiveContextId,
                      chosenPeriod: spec.issuedAt ? issuedAt.slice(0, 10) : period,
                    });
                    if (check.check?.mismatch) {
                      setGatePassPendingKey(s3Key);
                      setGatePassWarning(check.check);
                      return;
                    }
                  }
                }

                const filed = await finalizeDocument({
                  docTypeId: spec.id,
                  contextId: effectiveContextId,
                  s3Key,
                  fileName: file.name,
                  contentType: file.type || "application/octet-stream",
                  byteSize: file.size,
                  period,
                  issuedAt: spec.issuedAt ? issuedAt : undefined,
                });
                if (filed.error) return setError(filed.error);
                setDone({ message: filed.message ?? "Filed.", href: filed.href });
                setFile(null);
                setGatePassPendingKey(null);
                setGatePassWarning(null);
                router.refresh();
              })
            }
          >
            {pending ? "Filing…" : gatePassPendingKey ? "File it" : "Upload & file"}
          </button>
        </>
      ) : null}
      </Card>
      )}
    </div>
  );
}

function StepNo({ n }: { n: number }) {
  return (
    <span
      className="inline-grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full text-[13px] font-bold"
      style={{ background: "var(--accent)", color: "var(--text-on-accent)" }}
    >
      {n}
    </span>
  );
}

function TypeIcon({ d, active = false }: { d: string; active?: boolean }) {
  return (
    <span
      className="inline-grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px]"
      style={active ? { background: "var(--accent)", color: "var(--text-on-accent)" } : { background: "var(--neu-bg)", color: "var(--text-muted)" }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={d} />
      </svg>
    </span>
  );
}
