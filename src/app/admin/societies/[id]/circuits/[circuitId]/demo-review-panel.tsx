"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveDemoResultReview } from "./demo-review-actions";
import { Card, ErrorText, Field, StatusChip } from "@/components/ui";
import {
  RESOLUTION_DETAIL,
  RESOLUTION_LABEL,
  type DemoResolution,
} from "@/lib/demo-result-review";

const ORDER: DemoResolution[] = ["rerun_window", "installation_defect", "escalate_manual_benchmark"];

export function DemoReviewPanel({
  reviewId,
  measuredSavingsPct,
  preInstallBaseline,
  postInstallAverage,
  occurrence,
  urgencyLabel,
  urgencyTone,
  canResolve,
}: {
  reviewId: string;
  measuredSavingsPct: number;
  preInstallBaseline: number;
  postInstallAverage: number;
  occurrence: number;
  urgencyLabel: string;
  urgencyTone: "warn" | "bad";
  canResolve: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [resolution, setResolution] = useState<DemoResolution>("rerun_window");
  const [note, setNote] = useState("");
  const [loadPct, setLoadPct] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="max-w-2xl mb-10">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-3">
        <h2 className="text-[15px] font-semibold">Out-of-range demo result</h2>
        <StatusChip tone={urgencyTone}>{urgencyLabel}</StatusChip>
      </div>

      <Card className="p-5 text-sm space-y-4">
        <p className="text-[var(--text-muted)]">
          The post-install window completed at{" "}
          <span className="num font-semibold" style={{ color: "var(--text)" }}>
            {measuredSavingsPct.toFixed(1)}%
          </span>{" "}
          savings — <span className="num">{postInstallAverage.toFixed(2)}</span> kWh/day against a{" "}
          <span className="num">{preInstallBaseline.toFixed(2)}</span> kWh/day baseline — which is outside
          CON-20&apos;s 60–80% band, so it was <strong>not</strong> written as the benchmark.
        </p>

        {/* FEAT-015-AC-5 — a second failure is not a first one repeated. */}
        {occurrence >= 2 && (
          <p style={{ color: "var(--bad-fg)" }}>
            This is attempt {occurrence} for this circuit. Re-running the window has already failed once —
            a defect or a manual decision is the more likely answer than measuring again.
          </p>
        )}

        {!canResolve ? (
          // FEAT-015-AC-4 — the screen names who can act rather than going blank.
          <p className="text-[var(--text-muted)]">
            Reviewing an out-of-range result is the operations lead&apos;s action.
          </p>
        ) : (
          <>
            <fieldset className="space-y-2">
              <legend className="lbl mb-2">How is this being resolved?</legend>
              {ORDER.map((r) => (
                <label key={r} className="flex gap-2.5 items-start text-sm cursor-pointer">
                  <input
                    type="radio"
                    name={`res-${reviewId}`}
                    checked={resolution === r}
                    onChange={() => setResolution(r)}
                    disabled={pending}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">{RESOLUTION_LABEL[r]}</span>
                    <span className="block text-xs text-[var(--text-muted)]">{RESOLUTION_DETAIL[r]}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <Field label="What was found on site?" htmlFor={`note-${reviewId}`}>
              <input
                id={`note-${reviewId}`}
                className="field"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={pending}
                placeholder="e.g. two fixtures on the circuit were never replaced"
              />
            </Field>

            <Field
              label="Re-validated load, % discrepancy (optional)"
              htmlFor={`load-${reviewId}`}
            >
              <input
                id={`load-${reviewId}`}
                className="field"
                type="number"
                step="0.1"
                value={loadPct}
                onChange={(e) => setLoadPct(e.target.value)}
                disabled={pending}
                placeholder="leave blank if load wasn't re-checked"
              />
            </Field>

            {error && <ErrorText>{error}</ErrorText>}

            <button
              type="button"
              className="btn-primary"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await resolveDemoResultReview(reviewId, {
                    resolution,
                    note,
                    loadRevalidatedPct: loadPct.trim() ? Number(loadPct) : undefined,
                  });
                  if (result?.error) {
                    setError(result.error);
                    return;
                  }
                  setNote("");
                  setLoadPct("");
                  router.refresh();
                });
              }}
            >
              {pending ? "Recording…" : "Record resolution"}
            </button>
          </>
        )}
      </Card>
    </section>
  );
}
