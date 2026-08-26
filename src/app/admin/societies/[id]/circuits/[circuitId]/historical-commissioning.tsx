"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, ErrorText, Field } from "@/components/ui";
import { recordHistoricalCommissioning } from "./actions";

/**
 * The short path for a circuit that predates this system: two dates, not a
 * re-enactment of commissioning. They are what CON-45 needs to phase an
 * upload — everything else still comes from the readings.
 */
export function HistoricalCommissioning({
  circuitId,
  meterInstalledAt,
  lightReplacementDate,
  embedded = false,
}: {
  circuitId: string;
  meterInstalledAt: string | null;
  lightReplacementDate: string | null;
  /** Rendered as a step's body, where the step header already names it. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [meter, setMeter] = useState(meterInstalledAt ?? "");
  const [replaced, setReplaced] = useState(lightReplacementDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = Boolean(meterInstalledAt);

  const inner = (
    <>
      {!embedded && <CardTitle>What already happened</CardTitle>}
      <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
        This circuit was commissioned before the system existed, so it is not walked through meter
        install, gate passes and a baseline window — those happened. Two dates are still needed: the
        readings are phased against them, and the demo report states both.
        {done ? "" : " No baseline or benchmark is set here — those come from the readings."}
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Meter installed on" htmlFor="hc-meter">
          <input
            id="hc-meter"
            type="date"
            className="field field-auto"
            value={meter}
            onChange={(e) => setMeter(e.target.value)}
          />
        </Field>
        <Field
          label="Lights replaced on"
          htmlFor="hc-replaced"
          hint="The last light replaced — CON-19 excludes that day"
        >
          <input
            id="hc-replaced"
            type="date"
            className="field field-auto"
            value={replaced}
            onChange={(e) => setReplaced(e.target.value)}
          />
        </Field>
        <button
          type="button"
          className="btn-primary mb-2"
          disabled={pending || !meter}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await recordHistoricalCommissioning({
                circuitId,
                meterInstalledOn: meter,
                lightReplacementOn: replaced || undefined,
              });
              if (r.error) setError(r.error);
              else router.refresh();
            })
          }
        >
          {pending ? "Saving…" : done ? "Update" : "Record it"}
        </button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      {done && (
        <p className="mt-3 text-[13px]" style={{ color: "var(--ok-fg)" }}>
          Recorded. Upload this circuit&apos;s meter export next — the readings set the baseline and
          the benchmark through the usual review.
        </p>
      )}
    </>
  );

  return embedded ? inner : <Card className="mb-5 p-6">{inner}</Card>;
}
