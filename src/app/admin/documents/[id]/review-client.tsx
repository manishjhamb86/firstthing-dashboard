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
  societyName,
  societyId,
  existingCircuits,
}: {
  documentId: string;
  canRead: boolean;
  canCreate: boolean;
  modelError: string | null;
  proposed: ExtractedDocument | null;
  societyName: string;
  societyId: string;
  existingCircuits: number;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>(
    (proposed?.fixtures ?? []).map((f) => ({
      label: f.label,
      count: f.count === null ? "" : String(f.count),
      watts: f.watts === null ? "" : String(f.watts),
      hours: f.hoursPerDay === null ? "" : String(f.hoursPerDay),
      // Null means the document did not say — defaulting to "retrofitted"
      // would silently move the shared-load deduction, so it defaults to the
      // safer reading and the operator confirms.
      retrofitted: f.retrofitted === true,
      source: f.sourceText,
    })),
  );
  const [lightType, setLightType] = useState(proposed?.areaOrCircuit ?? "");
  const [represented, setRepresented] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ circuitId: string; proposedTypes: string[] } | null>(null);
  const [pending, start] = useTransition();

  const metered = lines
    .filter((l) => l.retrofitted)
    .reduce((n, l) => n + (Number(l.count) || 0), 0);
  const unanswered = (proposed?.clarifications ?? []).filter((c) => !answers[c.id]?.trim()).length;

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

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <Field label="Light type" htmlFor="fx-type" hint="Basement, staircase, lift lobby… (CON-11)">
            <input
              id="fx-type"
              className="field field-auto"
              value={lightType}
              onChange={(e) => setLightType(e.target.value)}
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
