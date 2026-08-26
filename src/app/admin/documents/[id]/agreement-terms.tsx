"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardTitle, ErrorText, Field } from "@/components/ui";
import type { ExtractedDocument } from "@/lib/document-extract";
import { createContractFromAgreement } from "../actions";

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
}: {
  documentId: string;
  proposed: ExtractedDocument;
  societyName: string;
  societyId: string;
  canRecord: boolean;
  alreadyContracted: boolean;
}) {
  const router = useRouter();
  const firstFromDoc = proposed.firsthingSharePct.value;
  const socFromDoc = proposed.societySharePct.value;
  const derivedSociety =
    socFromDoc !== null ? socFromDoc : firstFromDoc !== null ? 100 - firstFromDoc : null;

  const [societyShare, setSocietyShare] = useState(derivedSociety === null ? "" : String(derivedSociety));
  const [tolerance, setTolerance] = useState("10");
  const [rate, setRate] = useState("");
  const [term, setTerm] = useState(
    proposed.contractTermMonths.value === null ? "" : String(proposed.contractTermMonths.value),
  );
  const [lights, setLights] = useState(
    proposed.contractedLightCount.value === null ? "" : String(proposed.contractedLightCount.value),
  );
  const [benchmark, setBenchmark] = useState(
    proposed.savingsPct.value === null ? "" : String(proposed.savingsPct.value),
  );
  const [start, setStart] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startT] = useTransition();

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
    firstFromDoc !== null && socFromDoc === null
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
        {proposed.firsthingSharePct.sourceText && (
          <span className="mt-1 block text-[11px]" style={{ color: "var(--text-subtle)" }}>
            {proposed.firsthingSharePct.sourceText}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Field label="Society's share %" htmlFor="at-share">
          <input id="at-share" type="number" className="field field-auto w-28" value={societyShare} onChange={(e) => setSocietyShare(e.target.value)} />
        </Field>
        <Field label="Tolerance %" htmlFor="at-tol" hint="CON-01a — not usually printed; confirm it">
          <input id="at-tol" type="number" className="field field-auto w-24" value={tolerance} onChange={(e) => setTolerance(e.target.value)} />
        </Field>
        <Field label="₹ per kWh" htmlFor="at-rate" hint="The rate the agreement's money figures use">
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
        <Field label="Term started" htmlFor="at-start">
          <input id="at-start" type="date" className="field field-auto" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
      </div>

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
