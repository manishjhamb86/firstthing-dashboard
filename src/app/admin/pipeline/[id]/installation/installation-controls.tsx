"use client";

import { useState, useTransition } from "react";
import type { BlockerType } from "@prisma/client";
import { ErrorText, Field } from "@/components/ui";
import { Modal } from "@/components/modal";
import { uploadFileToS3 } from "@/lib/upload-to-s3";
import { prorateFirstMonth } from "@/lib/billing-start";
import { BLOCKER_TYPE_LABEL } from "@/lib/status-maps";
import {
  raiseBlocker,
  reopenBatch,
  resolveBlocker,
  signCompletionCertificate,
  skipReviewGate,
  startBatch,
  submitBatch,
  setUpInstallationProject,
  waiveBlocker,
  type PlannedDayInput,
} from "./actions";

// Every form here uses controlled inputs. That is not a style preference in
// this codebase: React 19 resets uncontrolled fields after *every* submission,
// success or failure, and combined with HTML5 `required` the browser then
// silently blocks the retry — the bug PROJECT_CONTEXT.md records against
// new-society-form.tsx and login-form.tsx.

type Account = { id: string; name: string | null; email: string; portalAuthority: string | null };

export function ProjectSetupForm({
  pipelineId,
  societyName,
  surveyedLightCount,
  accounts,
  initial,
}: {
  pipelineId: string;
  societyName: string;
  surveyedLightCount: number;
  accounts: Account[];
  initial?: { contractedLightCount: number; scopeVarianceNote: string; onlookerId: string; days: PlannedDayInput[] };
}) {
  const [contracted, setContracted] = useState(String(initial?.contractedLightCount ?? surveyedLightCount));
  const [variance, setVariance] = useState(initial?.scopeVarianceNote ?? "");
  const [onlookerId, setOnlookerId] = useState(initial?.onlookerId ?? "");
  const [days, setDays] = useState<PlannedDayInput[]>(
    initial?.days ?? [
      { day: 1, plannedDate: "", startTime: "09:00", areaKey: "", plannedCount: 0, assignedToId: null },
    ],
  );
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  const plannedTotal = days.reduce((n, d) => n + (Number(d.plannedCount) || 0), 0);
  const contractedNum = Number(contracted) || 0;
  const reconciles = plannedTotal === contractedNum;

  function setDay(i: number, patch: Partial<PlannedDayInput>) {
    setDays((prev) => prev.map((d, j) => (i === j ? { ...d, ...patch } : d)));
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        startTransition(async () => {
          const r = await setUpInstallationProject(pipelineId, {
            contractedLightCount: contractedNum,
            scopeVarianceNote: variance,
            onlookerId,
            days: days.map((d) => ({ ...d, plannedCount: Number(d.plannedCount) || 0 })),
          });
          setError(r?.error);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contracted light count" htmlFor="contracted-count" hint={`The survey found ${surveyedLightCount}.`}>
          <input
            id="contracted-count"
            className="field"
            type="number"
            min={1}
            value={contracted}
            onChange={(e) => setContracted(e.target.value)}
            required
          />
        </Field>
        <Field
          label="Society onlooker"
          htmlFor="onlooker-select"
          hint="Reviews each day's work. CON-21's gate cannot run without one."
        >
          <select id="onlooker-select" className="field" value={onlookerId} onChange={(e) => setOnlookerId(e.target.value)} required>
            <option value="">Choose an account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name ?? a.email} — {a.portalAuthority?.replace("_", "-")}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {contractedNum !== surveyedLightCount && (
        <Field
          label="Why the contracted scope differs from the survey"
          htmlFor="scope-variance"
          hint="Recorded against the project. The survey itself stays as it is — it is the record of what exists."
        >
          <textarea
            id="scope-variance"
            className="field"
            rows={2}
            value={variance}
            onChange={(e) => setVariance(e.target.value)}
            placeholder=""
          />
        </Field>
      )}

      <div>
        <p className="lbl mb-2">Day-by-day plan for {societyName}</p>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Day</th>
                <th>Date</th>
                <th>Crew start</th>
                <th>Area</th>
                <th>Planned lights</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) => (
                <tr key={i}>
                  <td className="num">{d.day}</td>
                  <td>
                    <input
                      className="field field-auto"
                      type="date"
                      value={d.plannedDate}
                      onChange={(e) => setDay(i, { plannedDate: e.target.value })}
                      required
                      aria-label={`Day ${d.day} date`}
                    />
                  </td>
                  <td>
                    <input
                      className="field field-auto"
                      type="time"
                      value={d.startTime}
                      onChange={(e) => setDay(i, { startTime: e.target.value })}
                      required
                      aria-label={`Day ${d.day} start time`}
                    />
                  </td>
                  <td>
                    <input
                      className="field field-auto"
                      value={d.areaKey}
                      onChange={(e) => setDay(i, { areaKey: e.target.value })}
                      required
                      aria-label={`Day ${d.day} area`}
                    />
                  </td>
                  <td>
                    <input
                      className="field field-auto num"
                      type="number"
                      min={0}
                      value={d.plannedCount}
                      onChange={(e) => setDay(i, { plannedCount: Number(e.target.value) })}
                      required
                      aria-label={`Day ${d.day} planned count`}
                    />
                  </td>
                  <td>
                    {days.length > 1 && (
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => setDays((prev) => prev.filter((_, j) => j !== i).map((x, j) => ({ ...x, day: j + 1 })))}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() =>
              setDays((prev) => [
                ...prev,
                { day: prev.length + 1, plannedDate: "", startTime: "09:00", areaKey: "", plannedCount: 0, assignedToId: null },
              ])
            }
          >
            Add a day
          </button>
          <span className={`text-sm ${reconciles ? "text-[var(--text-muted)]" : "text-[var(--bad-fg)]"}`}>
            {plannedTotal} planned against {contractedNum} contracted
            {reconciles ? " — reconciled" : " — these must match before publishing"}
          </span>
        </div>
      </div>

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Publishing…" : "Publish the plan"}
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </form>
  );
}

export function StartBatchButton({ pipelineId, plannedDayId }: { pipelineId: string; plannedDayId: string }) {
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  return (
    <span>
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={pending}
        onClick={() => startTransition(async () => setError((await startBatch(pipelineId, plannedDayId)).error))}
      >
        {pending ? "Opening…" : "Start this day"}
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </span>
  );
}

export function BatchCaptureForm({
  pipelineId,
  batchId,
  societyName,
  plannedCount,
}: {
  pipelineId: string;
  batchId: string;
  societyName: string;
  plannedCount: number;
}) {
  const [installed, setInstalled] = useState(String(plannedCount));
  const [removed, setRemoved] = useState("0");
  const [skipped, setSkipped] = useState("0");
  const [skippedReason, setSkippedReason] = useState("");
  const [location, setLocation] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = uploading || pending;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        setUploading(true);
        void (async () => {
          try {
            const keys: string[] = [];
            for (const [i, f] of files.entries()) {
              keys.push(
                await uploadFileToS3(f, {
                  society: societyName,
                  // INV-04 — the period is an explicit selection everywhere
                  // else; a batch photo's period is the day it documents,
                  // which the batch itself already fixes.
                  month: new Date().toISOString().slice(0, 7),
                  docType: "installationBatch",
                  dateLabel: new Date().toISOString().slice(0, 10),
                  identifier: `${batchId.slice(-6)}-${i + 1}`,
                }),
              );
            }
            setUploading(false);
            startTransition(async () => {
              const r = await submitBatch(pipelineId, batchId, {
                installedCount: Number(installed) || 0,
                removedFittingsCount: Number(removed) || 0,
                skippedCount: Number(skipped) || 0,
                skippedReason,
                locationDetail: location,
                photoKeys: keys,
              });
              setError(r?.error);
            });
          } catch (err) {
            setUploading(false);
            setError(err instanceof Error ? err.message : "Photo upload failed.");
          }
        })();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Fittings installed" htmlFor="installed-count" hint={`Today's target is ${plannedCount}.`}>
          <input id="installed-count" className="field num" type="number" min={0} value={installed} onChange={(e) => setInstalled(e.target.value)} required />
        </Field>
        <Field label="Old fittings taken away" hint="Reconciles against the outbound gate pass.">
          <input className="field num" type="number" min={0} value={removed} onChange={(e) => setRemoved(e.target.value)} />
        </Field>
        <Field label="Skipped" hint="Stays in outstanding scope.">
          <input className="field num" type="number" min={0} value={skipped} onChange={(e) => setSkipped(e.target.value)} />
        </Field>
      </div>

      {Number(skipped) > 0 && (
        <Field label="Why those were skipped">
          <input className="field" value={skippedReason} onChange={(e) => setSkippedReason(e.target.value)} required />
        </Field>
      )}

      <Field label="Where in the area" htmlFor="batch-location" hint="Floor, wing, corridor — what a disputing onlooker needs to go and check.">
        <input id="batch-location" className="field" value={location} onChange={(e) => setLocation(e.target.value)} />
      </Field>

      <Field label="Photos" htmlFor="batch-photos" hint="Required. Without them a dispute is one person's word against another's.">
        <input
          id="batch-photos"
          className="field"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </Field>

      <button type="submit" className="btn-primary" disabled={busy}>
        {uploading ? "Uploading photos…" : pending ? "Submitting…" : "Submit the day's batch"}
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </form>
  );
}

export function ReopenBatchControl({ pipelineId, batchId }: { pipelineId: string; batchId: string }) {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => setOpen(true)}>
        Reopen for rework
      </button>
    );
  }
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        startTransition(async () => setError((await reopenBatch(pipelineId, batchId, reason))?.error));
      }}
    >
      <input
        className="field"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-label="Why it is being reopened"
        required
      />
      <div className="flex gap-2">
        <button type="submit" className="btn-secondary btn-sm" disabled={pending}>
          {pending ? "Reopening…" : "Reopen"}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </form>
  );
}

export function SkipGateForm({ pipelineId, plannedDayId }: { pipelineId: string; plannedDayId: string }) {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Skip the review gate for this day
      </button>
    );
  }
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        startTransition(async () => setError((await skipReviewGate(pipelineId, plannedDayId, reason))?.error));
      }}
    >
      <Field
        label="Why this project is spending its one skip"
        htmlFor="skip-reason"
        hint="CON-21 allows exactly one per project. There is no second."
      >
        <textarea id="skip-reason" className="field" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required />
      </Field>
      <div className="flex gap-2">
        <button type="submit" className="btn-tone-bad btn-sm" disabled={pending}>
          {pending ? "Recording…" : "Use the skip"}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </form>
  );
}

export function RaiseBlockerForm({
  pipelineId,
  areas,
  batches,
}: {
  pipelineId: string;
  areas: string[];
  batches: { id: string; label: string }[];
}) {
  const [type, setType] = useState<BlockerType>("site_condition");
  const [areaKey, setAreaKey] = useState(areas[0] ?? "");
  const [detail, setDetail] = useState("");
  const [batchId, setBatchId] = useState("");
  const [affectedDate, setAffectedDate] = useState("");
  const [discovered, setDiscovered] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  // A form nobody is filling in most of the time does not belong open under
  // the list it adds to (user-reported 2026-08-20). It is one button now,
  // and the form is a dialog — the same treatment the inventory's own
  // add-line control already uses.
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
        Raise a blocker
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Raise a blocker"
        description="Anything stopping the crew, or a requirement that turned out different on site."
      >
    <form
      id="raise-blocker-form"
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        startTransition(async () => {
          const r = await raiseBlocker(pipelineId, {
            type,
            areaKey,
            detail,
            batchId: batchId || null,
            affectedDate: affectedDate || null,
            discoveredLightCount: type === "count_discrepancy" ? Number(discovered) || null : null,
            photoKeys: [],
          });
          if (r?.error) setError(r.error);
          else {
            setDetail("");
            setDiscovered("");
            setOpen(false);
          }
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="What kind" htmlFor="blocker-type">
          <select id="blocker-type" className="field" value={type} onChange={(e) => setType(e.target.value as BlockerType)}>
            {Object.entries(BLOCKER_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Area">
          <input className="field" value={areaKey} onChange={(e) => setAreaKey(e.target.value)} list="blocker-areas" />
          <datalist id="blocker-areas">
            {areas.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>
      </div>

      {type === "count_discrepancy" && (
        <Field
          label="Light count actually found"
          htmlFor="discovered-count"
          hint="This changes the represented count and therefore every future bill — it routes to a contract decision, never a silent edit."
        >
          <input id="discovered-count" className="field num" type="number" min={1} value={discovered} onChange={(e) => setDiscovered(e.target.value)} required />
        </Field>
      )}

      <Field label="What is happening" htmlFor="blocker-detail">
        <textarea id="blocker-detail" className="field" rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date affected" hint="A blocker still open past this is schedule-impacting.">
          <input className="field" type="date" value={affectedDate} onChange={(e) => setAffectedDate(e.target.value)} />
        </Field>
        {batches.length > 0 && (
          <Field label="Against a batch (optional)">
            <select className="field" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              <option value="">Not batch-specific</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Raising…" : "Raise the blocker"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </form>
      </Modal>
    </>
  );
}

export function ResolveBlockerControls({
  pipelineId,
  blockerId,
  canWaive,
}: {
  pipelineId: string;
  blockerId: string;
  canWaive: boolean;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <input
        className="field"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="What was done"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={pending}
          onClick={() => startTransition(async () => setError((await resolveBlocker(pipelineId, blockerId, text))?.error))}
        >
          {pending ? "Saving…" : "Resolve"}
        </button>
        {canWaive && (
          <button
            type="button"
            className="btn-ghost btn-sm"
            disabled={pending}
            onClick={() => startTransition(async () => setError((await waiveBlocker(pipelineId, blockerId, text))?.error))}
          >
            Waive for completion
          </button>
        )}
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

export function CompletionForm({ pipelineId }: { pipelineId: string }) {
  const [signedAt, setSignedAt] = useState(new Date().toISOString().slice(0, 10));
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  // Computed client-side from the same pure module the Server Action uses, so
  // the figure shown before signing and the figure written on signing cannot
  // disagree — and so the preview updates as the date changes without a round
  // trip.
  const proration = prorateFirstMonth(new Date(`${signedAt}T00:00:00.000Z`));
  const preview = {
    start: proration.billingStart.toISOString().slice(0, 10),
    days: proration.proratedDays,
    daysInMonth: proration.daysInMonth,
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        startTransition(async () => {
          const r = await signCompletionCertificate(pipelineId, {
            signedAt,
            signatoryName: name,
            signatoryRole: role,
            signatureKey: null,
          });
          setError(r?.error);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Signature date" htmlFor="signed-at">
          <input id="signed-at" className="field" type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} required />
        </Field>
        <Field label="Who signed" htmlFor="signatory-name">
          <input id="signatory-name" className="field" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="In what capacity" htmlFor="signatory-role">
          <input id="signatory-role" className="field" value={role} onChange={(e) => setRole(e.target.value)} required />
        </Field>
      </div>

      {/* CON-22 stated before the signature, never discovered on the first
          invoice — SCR-064's own rule. */}
      <div
        className="rounded-[var(--r-md)] border p-4 text-sm"
        style={{ borderColor: "var(--info-line)", background: "var(--info-bg)", color: "var(--info-fg)" }}
      >
        <strong>Billing starts {preview.start}</strong> — the day after signing. The first invoice covers{" "}
        {preview.days} of {preview.daysInMonth} days that month, prorated.
      </div>

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Recording…" : "Record the signed certificate"}
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </form>
  );
}
