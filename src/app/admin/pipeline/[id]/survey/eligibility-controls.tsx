"use client";

import { useState, useTransition } from "react";
import { approveEligibilityException, correctCircuitEligibility } from "./actions";
import { ErrorText } from "@/components/ui";
import { CON16_HARD_CRITERIA, CRITERION_WAIVER_NOTE, criterionLabel } from "@/lib/circuit-eligibility";

/**
 * Operations' two ways past a failed CON-16 checklist, deliberately separate.
 *
 * Correcting says the recorded answer was WRONG. An exception says the answer
 * stands and operations is proceeding anyway, with a reason. One control doing
 * both would let a site fact be rewritten to clear a gate and leave no trace
 * that anything was waived — and the waiver is the thing the commissioning
 * team has to be able to read (a waived WiFi criterion means the meter may
 * never report).
 *
 * Both are closed by default: an open form on a candidate reads as a field
 * still waiting to be filled in, which is the confusion already recorded for
 * the benchmark override.
 */
export function EligibilityControls({
  circuitId,
  outstanding,
  checks,
}: {
  circuitId: string;
  /** Criterion keys still in the way — what an exception would waive. */
  outstanding: string[];
  /** The answers as recorded, so Correct opens on them rather than on blanks. */
  checks: Record<string, boolean>;
}) {
  const [open, setOpen] = useState<"none" | "correct" | "waive">("none");
  const [draft, setDraft] = useState(checks);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const close = () => {
    setOpen("none");
    setError(undefined);
    setDraft(checks);
    setNote("");
    setReason("");
  };

  const run = (fn: () => Promise<{ error?: string } | void>) =>
    startTransition(async () => {
      const r = await fn();
      if (r && "error" in r && r.error) setError(r.error);
      else close();
    });

  if (open === "none") {
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={() => setOpen("correct")}>
          Correct the checklist
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen("waive")}>
          Approve an exception
        </button>
      </div>
    );
  }

  if (open === "correct") {
    return (
      <div className="mt-3 space-y-2.5 text-sm">
        <p className="text-xs text-[var(--text-muted)]">
          Use this when an answer was recorded wrongly on site. The circuit&apos;s eligibility is
          re-derived from the corrected answers — it does not waive anything.
        </p>
        {CON16_HARD_CRITERIA.map((k) => (
          <label key={k.name} className="flex items-center gap-2.5" htmlFor={`elig-${k.name}-${circuitId}`}>
            <input
              id={`elig-${k.name}-${circuitId}`}
              type="checkbox"
              checked={draft[k.name] ?? false}
              onChange={(e) => setDraft((p) => ({ ...p, [k.name]: e.target.checked }))}
              disabled={pending}
            />
            {k.label}
          </label>
        ))}
        <label className="block" htmlFor={`elig-note-${circuitId}`}>
          <span className="lbl">What was re-checked</span>
          <input
            id={`elig-note-${circuitId}`}
            className="field mt-1"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Re-checked on site — the fixtures are clear of the ramp."
            disabled={pending}
          />
        </label>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={pending}
            onClick={() =>
              run(() =>
                correctCircuitEligibility(
                  circuitId,
                  {
                    wifiReachable: draft.wifiReachable ?? false,
                    fixturesUnder15ft: draft.fixturesUnder15ft ?? false,
                    notOnDrivewayOrRamp: draft.notOnDrivewayOrRamp ?? false,
                  },
                  note,
                ),
              )
            }
          >
            {pending ? "Saving…" : "Save the corrected answers"}
          </button>
          <button type="button" className="btn-outline" onClick={close} disabled={pending}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2.5 text-sm">
      <p className="text-xs text-[var(--text-muted)]">
        Waives{" "}
        <strong>{outstanding.map((c) => criterionLabel(c)).join(" · ")}</strong> for this circuit.
        The answers stay on record exactly as the surveyor gave them; the waiver is recorded beside
        them with your name against it.
      </p>
      {outstanding
        .map((c) => CRITERION_WAIVER_NOTE[c])
        .filter(Boolean)
        .map((n) => (
          <p key={n} className="text-xs" style={{ color: "var(--warn-fg)" }}>
            {n}
          </p>
        ))}
      <label className="block" htmlFor={`elig-reason-${circuitId}`}>
        <span className="lbl">Why this circuit proceeds anyway</span>
        <input
          id={`elig-reason-${circuitId}`}
          className="field mt-1"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Society has no other basement circuit; the ramp section is bollarded."
          disabled={pending}
        />
      </label>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={() => run(() => approveEligibilityException(circuitId, reason))}
        >
          {pending ? "Approving…" : "Approve the exception"}
        </button>
        <button type="button" className="btn-outline" onClick={close} disabled={pending}>
          Cancel
        </button>
      </div>
    </div>
  );
}
