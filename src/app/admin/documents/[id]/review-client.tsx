"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardTitle, ErrorText, Field } from "@/components/ui";
import type { ExtractedDocument } from "@/lib/document-extract";
import { createCircuitFromDocument, readStoredDocument } from "../actions";

type Line = { label: string; count: string; watts: string; hours: string; retrofitted: boolean; source: string };

/**
 * The model proposes; a person decides. Every figure arrives with the words
 * it was read from, every question the document did not settle is asked, and
 * nothing reaches a circuit until someone presses the button.
 */
export function ExtractionReview({
  documentId,
  canRead,
  canCreate,
  modelError,
  proposed,
  alreadyUsed,
  /** Changes when a new reading lands — see the state sync below. */
  extractedAt,
  societyName,
  societyId,
  existingCircuits,
}: {
  documentId: string;
  canRead: boolean;
  canCreate: boolean;
  modelError: string | null;
  proposed: ExtractedDocument | null;
  /** A circuit has already been built from this reading. */
  alreadyUsed: boolean;
  extractedAt: string | null;
  societyName: string;
  societyId: string;
  existingCircuits: number;
}) {
  const router = useRouter();
  const linesFrom = (d: ExtractedDocument | null): Line[] =>
    (d?.fixtures ?? []).map((f) => ({
      label: f.label,
      count: f.count === null ? "" : String(f.count),
      watts: f.watts === null ? "" : String(f.watts),
      hours: f.hoursPerDay === null ? "" : String(f.hoursPerDay),
      // Null means the document did not say — defaulting to "retrofitted"
      // would silently move the shared-load deduction, so it defaults to the
      // safer reading and the operator confirms.
      retrofitted: f.retrofitted === true,
      source: f.sourceText,
    }));

  const [lines, setLines] = useState<Line[]>(linesFrom(proposed));
  const [lightType, setLightType] = useState("");
  const [location, setLocation] = useState(proposed?.areaOrCircuit ?? "");
  // The reading arrives AFTER this component first mounted: "Read this
  // document" calls router.refresh(), and React keeps the same instance, so a
  // useState initialiser never runs again — the fixtures the model found sat
  // in the props while the form showed none, and submitting then failed with
  // "record at least one fixture line" (user-reported 2026-08-26). Adjusted
  // during render against a tracked previous value, which is React's own
  // documented pattern and the one this repo already used for the monitoring
  // window's date default; an effect here would be a second render with the
  // wrong values on screen in between.
  const [seededFrom, setSeededFrom] = useState<string | null>(null);
  if (proposed && extractedAt && seededFrom !== extractedAt) {
    setSeededFrom(extractedAt);
    setLines(linesFrom(proposed));
    setLocation(proposed.areaOrCircuit ?? "");
  }
  const [represented, setRepresented] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ circuitId: string; proposedTypes: string[] } | null>(null);
  const [pending, start] = useTransition();

  // The document names a society. If that is not the one it was filed
  // against, the circuit is about to be built on the wrong society — which is
  // silent and expensive to unpick, so it is said out loud before the button.
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const onDoc = proposed?.societyNameOnDocument?.trim() ?? "";
  const societyMismatch =
    onDoc.length > 2 &&
    norm(onDoc) !== norm(societyName) &&
    !norm(onDoc).includes(norm(societyName)) &&
    !norm(societyName).includes(norm(onDoc));

  const metered = lines
    .filter((l) => l.retrofitted)
    .reduce((n, l) => n + (Number(l.count) || 0), 0);
  const unanswered = (proposed?.clarifications ?? []).filter((c) => !answers[c.id]?.trim()).length;

  // Offering "Create the circuit" again on a report that already produced one
  // is how a society ends up with the same circuit twice — and a duplicate
  // circuit bills twice (CON-11).
  if (alreadyUsed && !made) {
    return (
      <Card className="p-6">
        <CardTitle>A circuit has already been built from this report</CardTitle>
        <p className="text-sm">
          Reading it again would not change that. If the circuit is wrong, correct it in the registry
          — or remove it there and file a corrected version of this document.
        </p>
        <Link href={`/admin/societies/${societyId}/circuits`} className="btn-primary mt-4 inline-block">
          Open the circuit registry →
        </Link>
      </Card>
    );
  }

  if (made) {
    return (
      <Card className="p-6">
        <CardTitle>Circuit created</CardTitle>
        <p className="text-sm">
          Built from this report against {societyName}. No baseline or benchmark was taken from it —
          those come from readings, which go through the usual review.
        </p>
        {made.proposedTypes.length > 0 && (
          <p className="mt-2 text-[13px]" style={{ color: "var(--warn-fg)" }}>
            {made.proposedTypes.join(", ")} {made.proposedTypes.length === 1 ? "was" : "were"} not in the
            catalog, so {made.proposedTypes.length === 1 ? "it is" : "they are"} waiting for operations
            to confirm. The circuit&apos;s load cannot be validated until then.
          </p>
        )}
        <Link href={`/admin/societies/${societyId}/circuits`} className="btn-primary mt-4 inline-block">
          Open the circuit registry →
        </Link>
      </Card>
    );
  }

  if (!proposed) {
    return (
      <Card className="p-6">
        <CardTitle>Read the figures out of this document</CardTitle>
        <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
          {existingCircuits === 0
            ? `${societyName} has no circuits yet. This report carries the light counts, wattages and running hours one is built from.`
            : "Pulls out the fixtures, the readings and the figures — as a proposal you confirm, not a saved record."}
        </p>
        {modelError && <ErrorText>{modelError}</ErrorText>}
        {error && <ErrorText>{error}</ErrorText>}
        <button
          type="button"
          className="btn-primary"
          disabled={pending || !canRead}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await readStoredDocument(documentId);
              if (r.error) setError(r.error);
              else router.refresh();
            })
          }
        >
          {pending ? "Reading…" : "Read this document"}
        </button>
        {!canRead && (
          <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
            Needs the manage pipeline permission.
          </p>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {proposed.clarifications.length > 0 && (
        <Card className="p-6">
          <CardTitle>What the document does not settle</CardTitle>
          <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
            Each of these has a number or a party on the other side, so they are asked rather than
            guessed.
          </p>
          <ul className="space-y-4">
            {proposed.clarifications.map((c) => (
              <li key={c.id}>
                <p className="text-sm font-semibold">{c.question}</p>
                <p className="mb-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {c.because}
                </p>
                <div className="flex flex-wrap gap-2">
                  {c.options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      className={answers[c.id] === o ? "btn-primary" : "btn-secondary"}
                      onClick={() => setAnswers((a) => ({ ...a, [c.id]: o }))}
                    >
                      {o}
                    </button>
                  ))}
                </div>
                <input
                  className="field mt-2"
                  placeholder="…or write the answer"
                  value={answers[c.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [c.id]: e.target.value }))}
                  aria-label={c.question}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {societyMismatch && (
        <Card className="p-6">
          <p
            className="rounded-[var(--r-sm)] border p-3.5 text-[13px]"
            style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" }}
          >
            <strong>This document names {onDoc}</strong>, but it is filed against {societyName}. Check
            it is the right society before creating a circuit — a circuit on the wrong society is
            silent and awkward to unpick.
          </p>
        </Card>
      )}

      <Card className="p-6">
        <CardTitle>The circuit this report describes</CardTitle>
        <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Read from the document — check each line against the words it came from. Untick anything
          that shares the circuit but was not replaced; its load comes off both sides of the savings
          figure.
        </p>

        <div className="space-y-3">
          {lines.map((l, i) => (
            <div
              key={i}
              className="rounded-[var(--r-sm)] border p-3"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Fixture" htmlFor={`fx-label-${i}`}>
                  <input
                    id={`fx-label-${i}`}
                    className="field field-auto"
                    value={l.label}
                    onChange={(e) => setLines((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  />
                </Field>
                <Field label="Count" htmlFor={`fx-count-${i}`}>
                  <input
                    id={`fx-count-${i}`}
                    type="number"
                    className="field field-auto w-20"
                    value={l.count}
                    onChange={(e) => setLines((p) => p.map((x, j) => (j === i ? { ...x, count: e.target.value } : x)))}
                  />
                </Field>
                <Field label="W each" htmlFor={`fx-w-${i}`}>
                  <input
                    id={`fx-w-${i}`}
                    type="number"
                    className="field field-auto w-24"
                    value={l.watts}
                    onChange={(e) => setLines((p) => p.map((x, j) => (j === i ? { ...x, watts: e.target.value } : x)))}
                  />
                </Field>
                <Field label="Runs" htmlFor={`fx-h-${i}`}>
                  <input
                    id={`fx-h-${i}`}
                    type="number"
                    className="field field-auto w-20"
                    value={l.hours}
                    onChange={(e) => setLines((p) => p.map((x, j) => (j === i ? { ...x, hours: e.target.value } : x)))}
                  />
                </Field>
                <label className="flex items-center gap-1.5 pb-2 text-xs">
                  <input
                    type="checkbox"
                    checked={l.retrofitted}
                    onChange={(e) =>
                      setLines((p) => p.map((x, j) => (j === i ? { ...x, retrofitted: e.target.checked } : x)))
                    }
                    aria-label={`Line ${i + 1} was retrofitted`}
                  />
                  Retrofitted
                </label>
              </div>
              <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-subtle)" }}>
                {l.source}
              </p>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="btn-secondary mt-3"
          onClick={() =>
            setLines((p) => [
              ...p,
              { label: "", count: "", watts: "", hours: "24", retrofitted: true, source: "Added by hand — not read from the document." },
            ])
          }
        >
          Add a fixture line
        </button>
        {lines.length === 0 && (
          // Some reports describe a circuit without breaking it down. Saying
          // so beats an empty card and a refusal on submit.
          <p className="mt-2 text-[13px]" style={{ color: "var(--warn-fg)" }}>
            This document does not break the circuit down by fixture. Add the lines by hand from what
            it does say.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <Field label="Light type" htmlFor="fx-type" hint="What this circuit represents (CON-11)">
            <select
              id="fx-type"
              className="field field-auto"
              value={lightType}
              onChange={(e) => setLightType(e.target.value)}
            >
              <option value="">Choose…</option>
              {["basement", "stilt", "lift-lobby", "staircase", "external"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Location / area" htmlFor="fx-loc" hint="Where on site, in your words">
            <input
              id="fx-loc"
              className="field field-auto"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </Field>
          <Field
            label="Represented count"
            htmlFor="fx-rep"
            hint={`Society-wide lights of this type — at least the ${metered} on this circuit`}
          >
            <input
              id="fx-rep"
              type="number"
              className="field field-auto w-28"
              value={represented}
              onChange={(e) => setRepresented(e.target.value)}
            />
          </Field>
        </div>

        {error && <ErrorText>{error}</ErrorText>}
        {unanswered > 0 && (
          <p className="mt-3 text-[13px]" style={{ color: "var(--warn-fg)" }}>
            {unanswered} question{unanswered === 1 ? "" : "s"} above still unanswered — they are kept with
            the record, so answer them before creating the circuit.
          </p>
        )}

        <button
          type="button"
          className="btn-primary mt-4"
          disabled={pending || !canCreate || unanswered > 0}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await createCircuitFromDocument({
                documentId,
                lightType,
                location,
                representedLightCount: Number(represented),
                fixtures: lines.map((l) => ({
                  label: l.label,
                  count: Number(l.count),
                  watts: Number(l.watts),
                  hoursPerDay: Number(l.hours),
                  retrofitted: l.retrofitted,
                })),
                answers,
              });
              if (r.error) setError(r.error);
              else setMade({ circuitId: r.circuitId!, proposedTypes: r.proposedTypes ?? [] });
            })
          }
        >
          {pending ? "Creating…" : "Create the circuit"}
        </button>
        {!canCreate && (
          <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
            Creating a circuit needs field-survey access.
          </p>
        )}
      </Card>
    </div>
  );
}
