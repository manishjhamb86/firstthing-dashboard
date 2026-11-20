"use client";

import { FileDrop } from "@/components/file-drop";
import { useState, useTransition } from "react";
import { formatDate, formatInstant } from "@/lib/format-date";
import { Card, CardTitle, ErrorText, Field, StatusChip } from "@/components/ui";
import { REVIEW_LEAD_HOURS } from "@/lib/installation-gate";
import { approveBatch, disputeBatch } from "./installation-actions";
import { getDisputeUploadUrl } from "./uploads";

export type ReviewBatch = {
  id: string;
  day: number;
  areaKey: string;
  locationDetail: string | null;
  installedCount: number;
  skippedCount: number;
  skippedReason: string | null;
  photoUrls: string[];
  /** Set when the day was recorded after the fact with no photos. */
  photosWaivedReason?: string | null;
  submittedAt: string | null;
};

// SCR-062 — "one merged day, not three batches" (CON-44 §0.1b). Three
// technicians in three towers produced three area-scoped batches; the society
// sees the day's work as one thing, with the areas beneath it. The partition
// is how the work got done and is not something an RWA should have to approve
// around — so approving approves the day, area by area, in one act.
export function BatchReviewCard({
  batches,
  deadlineIso,
  totalPlanned,
  totalInstalledToDate,
  dayNumber,
  totalDays,
  canReview,
  onlookerName,
  workDateIso,
  nextDayNumber,
  nextDayDateIso,
}: {
  batches: ReviewBatch[];
  deadlineIso: string | null;
  totalPlanned: number;
  totalInstalledToDate: number;
  dayNumber: number;
  totalDays: number;
  canReview: boolean;
  onlookerName: string;
  /** The day the work was done — the card names it rather than saying "today" (2026-11-20, user-caught). */
  workDateIso: string | null;
  nextDayNumber: number | null;
  nextDayDateIso: string | null;
}) {
  const [error, setError] = useState<string | undefined>();
  const [disputing, setDisputing] = useState(false);
  const [note, setNote] = useState("");
  const [location, setLocation] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = uploading || pending;

  const todayTotal = batches.reduce((n, b) => n + b.installedCount, 0);
  const deadline = deadlineIso ? new Date(deadlineIso) : null;
  const overdue = deadline ? new Date() >= deadline : false;
  // Name the days by number and date, never "today"/"tomorrow": a day is
  // usually reviewed the day after it was worked, and a day recorded after
  // the fact can be weeks old.
  const workDate = workDateIso ? formatDate(workDateIso) : null;
  const thisDay = `day ${dayNumber}`;
  const nextDay = nextDayNumber ? `Day ${nextDayNumber}${nextDayDateIso ? ` (${formatDate(nextDayDateIso)})` : ""}` : null;

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-4">
        <div>
          <CardTitle>
            Day {dayNumber} installation{workDate ? `, ${workDate}` : ""} — please confirm
          </CardTitle>
          <p className="text-sm text-[var(--text-muted)]">
            Day {dayNumber} of {totalDays} · {totalInstalledToDate} of {totalPlanned} fittings installed so far
          </p>
        </div>
        {deadline && (
          <StatusChip tone={overdue ? "bad" : "warn"}>
            {overdue
              ? `${nextDay ? `Day ${nextDayNumber}` : "The next day"} is on hold`
              : `Approve by ${formatInstant(deadline)}`}
          </StatusChip>
        )}
      </div>

      <p className="text-[28px] font-bold leading-none num">{todayTotal}</p>
      <p className="text-sm text-[var(--text-muted)] mb-4">fittings installed{workDate ? ` on ${workDate}` : ` on ${thisDay}`}</p>

      <div className="space-y-3 mb-5">
        {batches.map((b) => (
          <div key={b.id} className="border-t border-[var(--border)] pt-3 first:border-0 first:pt-0">
            <p className="font-medium">
              {b.areaKey}
              {b.locationDetail ? ` — ${b.locationDetail}` : ""}
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              <span className="num">{b.installedCount}</span> installed
              {b.skippedCount > 0 ? ` · ${b.skippedCount} skipped (${b.skippedReason ?? "no reason given"})` : ""}
            </p>
            {b.photoUrls.length === 0 && b.photosWaivedReason && (
              <p className="mt-1 text-sm" style={{ color: "var(--warn-fg)" }}>
                No photos — this day was recorded after the fact: {b.photosWaivedReason}
              </p>
            )}
            {b.photoUrls.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {b.photoUrls.map((u, i) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer">
                    {/* Plain <img>, not next/image: these are S3 evidence
                        photos from an arbitrary bucket host, and routing them
                        through the optimizer would mean whitelisting that
                        host and paying to transform a thumbnail nobody
                        re-renders. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={u}
                      alt={`${b.areaKey} photo ${i + 1}`}
                      className="h-24 w-24 object-cover rounded-[var(--r-sm)] border border-[var(--border)]"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {overdue && (
        <div
          className="mb-4 rounded-[var(--r-md)] border p-4 text-sm"
          style={{ borderColor: "var(--bad-line)", background: "var(--bad-bg)", color: "var(--bad-fg)" }}
        >
          {nextDay ?? "The next day"} is on hold until {thisDay} is approved. Approving now still clears it.
        </div>
      )}

      {!canReview ? (
        <p className="text-sm text-[var(--text-muted)]">
          {onlookerName} is the onlooker for this installation — the approval has to come from them. You can see
          everything that was done here.
        </p>
      ) : disputing ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(undefined);
            if (!file) {
              setError("A dispute needs a photo — whoever comes to sort it out has to see what you saw.");
              return;
            }
            setUploading(true);
            void (async () => {
              try {
                const ext = file.name.split(".").pop() ?? "jpg";
                const { uploadUrl, key } = await getDisputeUploadUrl({
                  batchId: batches[0].id,
                  extension: ext,
                  contentType: file.type || "application/octet-stream",
                });
                const res = await fetch(uploadUrl, { method: "PUT", body: file });
                if (!res.ok) throw new Error(`Upload failed (${res.status})`);
                setUploading(false);
                startTransition(async () => {
                  // Every area of the day is disputed together — the society
                  // reviews a day, not a partition.
                  for (const b of batches) {
                    const r = await disputeBatch(b.id, { note, location, evidencePhotoKeys: [key] });
                    if (r?.error) {
                      setError(r.error);
                      return;
                    }
                  }
                });
              } catch (err) {
                setUploading(false);
                setError(err instanceof Error ? err.message : "Upload failed.");
              }
            })();
          }}
        >
          <Field label="What is wrong" htmlFor="dispute-note">
            <textarea id="dispute-note" className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} required />
          </Field>
          <Field label="Where" htmlFor="dispute-location" hint="Floor, wing or corridor — the crew has to be able to find it.">
            <input id="dispute-location" className="field" value={location} onChange={(e) => setLocation(e.target.value)} required />
          </Field>
          <Field label="Photo" htmlFor="dispute-photo" hint="Required.">
            <FileDrop id="dispute-photo" accept="image/*" files={file ? [file] : []} onFiles={(f) => setFile(f[0] ?? null)} compact />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-tone-bad" disabled={busy}>
              {uploading ? "Uploading…" : pending ? "Sending…" : "Send the dispute"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setDisputing(false)}>
              Cancel
            </button>
          </div>
          {error && <ErrorText>{error}</ErrorText>}
        </form>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            {/* Approving is one tap and no modal: it is the overwhelmingly
                common case with a hard deadline behind it, and friction here
                costs a crew a day. Disputing is deliberately harder. */}
            <button
              type="button"
              className="btn-tone-ok"
              disabled={busy}
              onClick={() =>
                startTransition(async () => {
                  for (const b of batches) {
                    const r = await approveBatch(b.id);
                    if (r?.error) {
                      setError(r.error);
                      return;
                    }
                  }
                })
              }
            >
              {pending ? "Approving…" : `Approve day ${dayNumber}'s work`}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setDisputing(true)}>
              Something is wrong
            </button>
          </div>
          {nextDay && (
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              {nextDay} can start only once {thisDay} is approved, at least {REVIEW_LEAD_HOURS} hours before its start.
            </p>
          )}
          {error && <ErrorText>{error}</ErrorText>}
        </>
      )}
    </Card>
  );
}
