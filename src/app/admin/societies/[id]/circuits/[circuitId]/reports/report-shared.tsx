"use client";

import { useState, useTransition } from "react";
import { ErrorText } from "@/components/ui";
import { raisePreInstallInvestigation } from "../reading-actions";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-tone-info no-print">
      Print / save as PDF
    </button>
  );
}

/**
 * The pre-install report's investigate hook: when the average varies beyond
 * ±10% of theoretical, the operator can proceed anyway (the report is right
 * there) or put the circuit in front of an inspector. The investigation
 * lands in the existing anomaly queue — a real queue ops already works.
 */
export function InvestigateButton({ circuitId, variancePct }: { circuitId: string; variancePct: number }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function raise() {
    const note = window.prompt(
      "Assign this circuit for inspection — what should the inspector look for? (e.g. an unknown device on the circuit)",
    );
    if (note === null) return;
    startTransition(async () => {
      const result = await raisePreInstallInvestigation(circuitId, note, variancePct);
      if ("error" in result) setError(result.error);
      else setDone(true);
    });
  }

  if (done) {
    return <p className="text-sm no-print">Raised — it&apos;s in the anomaly queue for assignment.</p>;
  }
  return (
    <span className="no-print">
      <button type="button" onClick={raise} disabled={pending} className="btn-secondary">
        Assign for investigation instead
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </span>
  );
}
