"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardTitle, ErrorText, Field } from "@/components/ui";
import type { ExtractedDocument } from "@/lib/document-extract";
import { createContractFromAgreement, startContractTerm } from "../actions";

const n = (v: string) => (v.trim() === "" ? NaN : Number(v));

/**
 * The commercial terms, read from the agreement and confirmed by a person.
 *
 * The share is the field this whole screen is careful about: an agreement
 * usually states ONE party's, and `Offer.revenueSharePct` means the SOCIETY's.
 * So both are shown, whichever was printed is labelled as read and the other
 * as derived, and neither is ever a bare percentage.
 */
export function AgreementTerms({
  documentId,
  proposed,
  societyName,
  societyId,
  canRecord,
  alreadyContracted,
  awaitingTermStart,
}: {
  documentId: string;
  proposed: ExtractedDocument;
  societyName: string;
  societyId: string;
  canRecord: boolean;
  alreadyContracted: boolean;
  /** Terms are on record; only the day the term began is missing. */
  awaitingTermStart: boolean;
}) {
  const router = useRouter();
  const firstFromDoc = proposed.firsthingSharePct.value;
  const socFromDoc = proposed.societySharePct.value;

  // The agreement usually prints the money the share is a share OF, so the
  // share can be CHECKED rather than trusted. Ace City's says ₹54,214 out of
  // ₹1,50,595 — 36% to FirsThing, 64% to the society — and the model read
  // that as a society share of 100% (user-reported 2026-08-26). Arithmetic
  // beats a misread sentence when the arithmetic is printed on the page.
  const fee = proposed.monthlyServiceChargeInr?.value ?? null;
  const savings = proposed.monthlySavingsInr?.value ?? null;
  const computedFirsthing =
    fee !== null && savings !== null && savings > 0 ? (fee / savings) * 100 : null;
  const computedSociety = computedFirsthing === null ? null : 100 - computedFirsthing;

  const statedSociety =
    socFromDoc !== null ? socFromDoc : firstFromDoc !== null ? 100 - firstFromDoc : null;
  // Where both exist and disagree by more than rounding, the computed one is
  // offered and the disagreement is shown — never silently resolved.
  const shareDisagrees =
    statedSociety !== null && computedSociety !== null && Math.abs(statedSociety - computedSociety) > 1;
  const derivedSociety = computedSociety ?? statedSociety;

  const [societyShare, setSocietyShare] = useState(derivedSociety === null ? "" : String(derivedSociety));
  const [tolerance, setTolerance] = useState("10");
  const [rate, setRate] = useState(
    proposed.unitElectricityRateInr?.value === null || proposed.unitElectricityRateInr?.value === undefined
      ? ""
      : String(proposed.unitElectricityRateInr.value),
  );
  const [term, setTerm] = useState(
    proposed.contractTermMonths.value === null ? "" : String(proposed.contractTermMonths.value),
  );
  const [lights, setLights] = useState(
    proposed.contractedLightCount.value === null ? "" : String(proposed.contractedLightCount.value),
  );
  const [benchmark, setBenchmark] = useState(
    proposed.savingsPct.value === null ? "" : String(proposed.savingsPct.value),
  );
  // Pre-filled from the document when it prints exactly one usable date.
  // When it prints several — an effective date, a signature date, a clause
  // saying the term runs from installation — they are offered rather than one
  // being chosen, because they are different dates and the wrong one moves
  // when billing starts.
  const dated = (proposed.dates ?? []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.value));

  // Which date is the signature, when several are printed.
  //
  // The user's rule (2026-08-26): take the stamped or front-page date. Ace
  // City's document prints "10/11/2025" in one place and a signature dated
  // "11/10/2025" in another — the same day in two formats, or two different
  // days, and nothing on the page settles which. The stamp is unambiguous, so
  // it wins; the rest stay one click away.
  const RANK = [/stamp/i, /front|first page|agreement date/i, /effective/i, /sign/i];
  const rankOf = (label: string) => {
    const i = RANK.findIndex((r) => r.test(label));
    return i === -1 ? RANK.length : i;
  };
  const preferred = [...dated].sort((a, b) => rankOf(a.label) - rankOf(b.label))[0] ?? null;
  const whyPreferred = preferred
    ? rankOf(preferred.label) === 0
      ? "Taken from the stamp, which is unambiguous."
      : rankOf(preferred.label) <= 2
        ? "Taken from the date on the agreement itself."
        : "Taken from the signature."
    : "";
  // Two different dates, and conflating them was the bug: the agreement is
  // signed, then installation happens — sometimes two months later — and the
  // three-year term runs from the day it completes and the society approves
  // it (the user's correction, 2026-08-26). The system's live path already
  // works this way: CON-22 starts billing from the completion certificate the
  // society signs, never from the agreement.
  const [executed, setExecuted] = useState(preferred?.value ?? "");
  const [start, setStart] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startT] = useTransition();

  // Skipping the term start is normal — it comes from the operator's records,
  // not the document — so the agreement waits here rather than the contract
  // being created with a date nobody had.
  if (awaitingTermStart && !done) {
    return (
      <Card className="p-6">
        <CardTitle>Terms recorded — the term has not started yet</CardTitle>
        <p className="mb-4 text-sm">
          {societyName}&apos;s agreement and its figures are on record. The contract starts on the day
          installation finished and the society approved it, which comes from your own records rather
          than this document. Until then there is nothing to bill against, so no contract is created.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Term started" htmlFor="at-late-start">
            <input id="at-late-start" type="date" className="field field-auto" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <button
            type="button"
            className="btn-primary mb-2"
            disabled={pending || !canRecord || !start}
            onClick={() =>
              startT(async () => {
                setError(null);
                const r = await startContractTerm({ documentId, termStart: start });
                if (r.error) setError(r.error);
                else {
                  setDone(true);
                  router.refresh();
                }
              })
            }
          >
            {pending ? "Starting…" : "Start the term"}
          </button>
        </div>
        {error && <ErrorText>{error}</ErrorText>}
      </Card>
    );
  }

  if (alreadyContracted) {
    return (
      <Card className="p-6">
        <CardTitle>{societyName} already has a lighting contract</CardTitle>
        <p className="text-sm">
          A second one would give the same society two sets of terms to be billed against. Amend the
          existing contract instead — an amendment applies forward only, and the month already
          computed stays on the version in force at the time.
        </p>
      </Card>
    );
  }

  if (done) {
    return (
      <Card className="p-6">
        <CardTitle>Contract recorded</CardTitle>
        <p className="text-sm">
          The deal, the offer, the executed agreement and an active contract now exist for{" "}
          {societyName}, with this document attached as the executed copy. Every figure came from it.
        </p>
        <Link href={`/admin/societies/${societyId}`} className="btn-primary mt-4 inline-block">
          Open the society →
        </Link>
      </Card>
    );
  }

  const shareRow =
    computedFirsthing !== null
      ? `₹${fee?.toLocaleString("en-IN")} of ₹${savings?.toLocaleString("en-IN")} saved is ${computedFirsthing.toFixed(1)}% to FirsThing — so ${computedSociety!.toFixed(1)}% to the society. Computed from the document's own figures.`
      : firstFromDoc !== null && socFromDoc === null
        ? `The document states FirsThing's share as ${firstFromDoc}%, so the society's is ${100 - firstFromDoc}% — derived, not printed.`
        : socFromDoc !== null
          ? `The document states the society's share as ${socFromDoc}%.`
          : "The document does not state either share — enter the society's.";

  return (
    <Card className="p-6">
      <CardTitle>The terms this agreement sets</CardTitle>
      <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
        Read from the document, and checked by you before anything is billed against them. Nothing
        here is defaulted from a template — a defaulted revenue share is invented money.
      </p>

      <div
        className="mb-4 rounded-[var(--r-sm)] border p-3 text-[13px]"
        style={{ borderColor: "var(--accent-line)", background: "var(--accent-subtle)" }}
      >
        <strong>Whose share is whose:</strong> {shareRow} The field below is always the{" "}
        <strong>society&apos;s</strong> share of the saving.
        <span className="mt-1.5 block">
          <strong>Two dates, not one:</strong> the agreement is signed, then the lights go in — that can
          take weeks — and the term runs from the day installation finished and the society approved
          it. A document usually prints the first and not the second.
        </span>
        {shareDisagrees && (
          <span className="mt-1.5 block font-semibold" style={{ color: "var(--warn-fg)" }}>
            The document&apos;s wording reads as {statedSociety!.toFixed(0)}% to the society, but its own
            figures give {computedSociety!.toFixed(1)}%. The figures are used — check the sentence
            below before recording.
          </span>
        )}
        {proposed.firsthingSharePct.sourceText && (
          <span className="mt-1 block text-[11px]" style={{ color: "var(--text-subtle)" }}>
            {proposed.firsthingSharePct.sourceText}
          </span>
        )}
        {proposed.monthlyServiceChargeInr?.sourceText && (
          <span className="mt-1 block text-[11px]" style={{ color: "var(--text-subtle)" }}>
            {proposed.monthlyServiceChargeInr.sourceText}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Field label="Society's share %" htmlFor="at-share">
          <input id="at-share" type="number" className="field field-auto w-28" value={societyShare} onChange={(e) => setSocietyShare(e.target.value)} />
        </Field>
        <Field
          label="₹ per kWh"
          htmlFor="at-rate"
          hint={proposed.unitElectricityRateInr?.value != null ? "Read from the document." : "The rate the agreement's money figures use"}
        >
          <input id="at-rate" type="number" step="0.01" className="field field-auto w-24" value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <Field label="Term (months)" htmlFor="at-term">
          <input id="at-term" type="number" className="field field-auto w-24" value={term} onChange={(e) => setTerm(e.target.value)} />
        </Field>
        <Field label="Lights contracted" htmlFor="at-lights">
          <input id="at-lights" type="number" className="field field-auto w-28" value={lights} onChange={(e) => setLights(e.target.value)} />
        </Field>
        <Field label="Agreed saving %" htmlFor="at-bench" hint="What the fee is a share of">
          <input id="at-bench" type="number" step="0.01" className="field field-auto w-28" value={benchmark} onChange={(e) => setBenchmark(e.target.value)} />
        </Field>
        {/* Beside the saving it bounds, not the share — it is a tolerance on
            the SAVING (CON-01a), and sitting next to the share read as a
            tolerance on that (user-reported 2026-08-26). */}
        <Field label="± on that saving %" htmlFor="at-tol" hint="CON-01a — how far a month may drift before it is a deviation">
          <input id="at-tol" type="number" className="field field-auto w-24" value={tolerance} onChange={(e) => setTolerance(e.target.value)} />
        </Field>
        <Field
          label="Agreement signed on"
          htmlFor="at-executed"
          hint={preferred ? whyPreferred : "The document prints no usable date."}
        >
          <input id="at-executed" type="date" className="field field-auto" value={executed} onChange={(e) => setExecuted(e.target.value)} />
        </Field>
        {/* The alternatives, right here rather than further down the page —
            "pick the signature" with nothing to pick was the complaint. */}
        {dated.length > 1 && (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
            <span style={{ color: "var(--text-muted)" }}>or:</span>
            {dated
              .filter((d) => d.value !== executed)
              .map((d, i) => (
                <button
                  key={i}
                  type="button"
                  className="btn-secondary"
                  onClick={() => setExecuted(d.value)}
                  title={d.sourceText}
                >
                  {d.label} <span className="num">{d.value}</span>
                </button>
              ))}
          </div>
        )}
        <Field
          label="Term started — leave blank if you do not have it"
          htmlFor="at-start"
          hint="The day installation finished and the society approved it, from your own records rather than this document. Skip it and the agreement is still recorded; the contract is created when you come back with the date."
        >
          <input id="at-start" type="date" className="field field-auto" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
      </div>

      {(proposed.dates ?? []).length > 0 && (
        <div className="mt-4">
          <p className="lbl mb-1.5">Dates this document states</p>
          <ul className="space-y-1.5 text-[12px]">
            {(proposed.dates ?? []).map((d, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2">
                <span className="font-semibold">{d.label}:</span>
                {d.value ? (
                  <>
                    <span className="num">{d.value}</span>
                    <button
                      type="button"
                      className="btn-ghost text-[12px]"
                      style={{ color: "var(--accent)" }}
                      onClick={() => setExecuted(d.value)}
                    >
                      use as signed on
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-[12px]"
                      style={{ color: "var(--accent)" }}
                      onClick={() => setStart(d.value)}
                    >
                      use as term start
                    </button>
                  </>
                ) : (
                  // A blank date in the document is a fact about the document.
                  <span style={{ color: "var(--warn-fg)" }}>left blank in the document</span>
                )}
                <span className="block w-full" style={{ color: "var(--text-subtle)" }}>
                  {d.sourceText}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {proposed.notFound.length > 0 && (
        <p className="mt-3 text-[12px]" style={{ color: "var(--text-subtle)" }}>
          Not printed in the document, so left for you: {proposed.notFound.join(", ")}.
        </p>
      )}
      {error && <ErrorText>{error}</ErrorText>}

      <button
        type="button"
        className="btn-primary mt-4"
        disabled={pending || !canRecord}
        onClick={() =>
          startT(async () => {
            setError(null);
            const r = await createContractFromAgreement({
              documentId,
              terms: {
                societySharePct: n(societyShare),
                tolerancePct: n(tolerance),
                unitElectricityRate: n(rate),
                termMonths: n(term),
                contractedLightCount: n(lights),
                benchmarkPct: n(benchmark),
                executedOn: executed,
                termStart: start,
              },
            });
            if (r.error) setError(r.error);
            else {
              setDone(true);
              router.refresh();
            }
          })
        }
      >
        {pending ? "Recording…" : "Record the contract"}
      </button>
      {!canRecord && (
        <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
          Needs the manage pipeline permission.
        </p>
      )}
    </Card>
  );
}
