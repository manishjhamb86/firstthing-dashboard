"use client";

import { useState, useTransition } from "react";
import { Card, CardTitle, ErrorText, Field } from "@/components/ui";
import { respondToOffer } from "./offer-actions";

// FEAT-108-AC-2 — the screen names who can perform the act rather than
// silently hiding it, so a committee member understands why they can't.
export function OfferCard({
  offer,
  canRespond,
}: {
  offer: {
    id: string;
    version: number;
    tolerancePct: number;
    revenueSharePct: number;
    unitElectricityRate: number;
    termMonths: number;
    projectedMonthlyFee: number | null;
    exclusions: string[];
  };
  canRespond: boolean;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function respond(outcome: "accepted" | "rejected") {
    startTransition(async () => {
      const r = await respondToOffer(offer.id, outcome, note);
      setError(r?.error);
      if (!r?.error) setNote("");
    });
  }

  return (
    <Card className="p-6">
      <CardTitle>Your offer</CardTitle>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 mt-4 text-sm">
        <div>
          <dt className="lbl">Your share of the savings</dt>
          <dd className="num">{offer.revenueSharePct}%</dd>
        </div>
        <div>
          <dt className="lbl">Tolerance band</dt>
          <dd className="num">±{offer.tolerancePct}%</dd>
        </div>
        <div>
          <dt className="lbl">Term</dt>
          <dd className="num">{offer.termMonths} months</dd>
        </div>
        <div>
          <dt className="lbl">Estimated monthly fee</dt>
          <dd className="num">
            {offer.projectedMonthlyFee != null ? `₹${offer.projectedMonthlyFee.toFixed(2)}` : "—"}
          </dd>
        </div>
      </dl>

      {offer.exclusions.length > 0 && (
        <div className="mt-4 text-sm">
          <p className="lbl mb-1">Not covered</p>
          <ul className="list-disc pl-5 text-[var(--text-muted)]">
            {offer.exclusions.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {canRespond ? (
        <div className="mt-5 space-y-3">
          <Field label="Anything to add?" htmlFor="po-note" hint="Required if you're declining.">
            <input
              id="po-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={pending}
              className="field"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={pending} onClick={() => respond("accepted")}>
              {pending ? "Sending…" : "Accept this offer"}
            </button>
            <button type="button" className="btn-ghost" disabled={pending} onClick={() => respond("rejected")}>
              Decline
            </button>
          </div>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      ) : (
        <p className="mt-5 text-sm text-[var(--text-muted)]">
          Only your society&apos;s office-bearer can accept or decline an offer.
        </p>
      )}
    </Card>
  );
}
